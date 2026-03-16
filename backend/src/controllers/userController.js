import WalletBinding from "../models/WalletBinding.js";
import User from "../models/User.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";

export const getMe = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { name, walletAddress } = req.body;

  if (name !== undefined) {
    req.user.name = String(name).trim();
  }

  if (walletAddress !== undefined) {
    req.user.walletAddress = String(walletAddress).trim();
  }

  await req.user.save();

  if (walletAddress) {
    await WalletBinding.findOneAndUpdate(
      { userId: req.user._id },
      { walletAddress: req.user.walletAddress, network: "BEP20" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  res.json({ user: req.user.toSafeObject() });
});

export const updateMyReferralCode = asyncHandler(async (req, res) => {
  const referralCode = String(req.body.referralCode || "").trim().toLowerCase();
  if (!referralCode) {
    throw new ApiError(400, "Referral code is required");
  }

  if (!/^[a-z0-9]{4,20}$/.test(referralCode)) {
    throw new ApiError(400, "Referral code must be 4-20 characters and contain only letters and numbers");
  }

  const currentCode = String(req.user.referralCode || "").toLowerCase();
  if (currentCode === referralCode) {
    return res.json({ user: req.user.toSafeObject(), message: "Referral code is already set" });
  }

  const changeCount = Number(req.user.referralCodeChangeCount || 0);
  if (changeCount >= 1) {
    throw new ApiError(400, "Referral code can be changed only once");
  }

  const existing = await User.findOne({ referralCode, _id: { $ne: req.user._id } }).select("_id");
  if (existing) {
    throw new ApiError(409, "Referral code already taken");
  }

  req.user.referralCode = referralCode;
  req.user.referralCodeChangeCount = changeCount + 1;
  await req.user.save();

  res.json({ user: req.user.toSafeObject(), message: "Referral code updated" });
});

export const bindWalletAddress = asyncHandler(async (req, res) => {
  const { walletAddress, network } = req.body;
  if (!walletAddress) {
    throw new ApiError(400, "Wallet address is required");
  }

  req.user.walletAddress = String(walletAddress).trim();
  await req.user.save();

  const binding = await WalletBinding.findOneAndUpdate(
    { userId: req.user._id },
    { walletAddress: req.user.walletAddress, network: network || "BEP20" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ binding });
});

export const getWalletBinding = asyncHandler(async (req, res) => {
  const binding = await WalletBinding.findOne({ userId: req.user._id });
  res.json({ binding });
});

export const lookupUserByUserId = asyncHandler(async (req, res) => {
  const userId = String(req.params.userId || "").toUpperCase().trim();
  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const user = await User.findOne({ userId }).select("_id userId name");
  if (!user) {
    throw new ApiError(404, "Invalid User ID");
  }

  res.json({
    user: {
      id: user._id,
      userId: user.userId,
      name: user.name,
    },
  });
});
