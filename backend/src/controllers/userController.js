import WalletBinding from "../models/WalletBinding.js";
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
