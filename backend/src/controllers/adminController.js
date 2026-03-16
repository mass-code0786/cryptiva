import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Withdrawal from "../models/Withdrawal.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { computeTeamBusiness } from "./referralController.js";
import { distributeReferralRewards } from "../services/referralService.js";

const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.search) {
    const search = String(req.query.search).trim();
    query.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { userId: { $regex: search, $options: "i" } }];
  }

  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  const userIds = users.map((item) => item._id);
  const wallets = await Wallet.find({ userId: { $in: userIds } });
  const walletMap = new Map(wallets.map((wallet) => [wallet.userId.toString(), wallet]));

  res.json({
    items: users.map((user) => ({
      ...user.toSafeObject(),
      createdAt: user.createdAt,
      referredBy: user.referredBy,
      wallet: walletMap.get(user._id.toString()) || null,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const listDeposits = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.status) {
    query.status = String(req.query.status).toLowerCase();
  }

  const [items, total] = await Promise.all([
    Deposit.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Deposit.countDocuments(query),
  ]);

  res.json({
    items,
    total,
    page,
    limit,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const approveDeposit = asyncHandler(async (req, res) => {
  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) {
    throw new ApiError(404, "Deposit request not found");
  }

  if (deposit.status !== "pending") {
    throw new ApiError(400, "Deposit is already processed");
  }

  const user = await User.findById(deposit.userId);
  if (!user) {
    throw new ApiError(404, "User not found for deposit");
  }

  const wallet = await ensureWallet(user._id);
  wallet.depositWallet += deposit.amount;
  wallet.depositTotal += deposit.amount;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  deposit.status = "confirmed";
  await deposit.save();

  await Promise.all([
    Transaction.findOneAndUpdate(
      { "metadata.depositId": deposit._id, type: "deposit" },
      { status: "confirmed", source: "Deposit approved by admin" },
      { new: true }
    ),
    distributeReferralRewards({ user, depositAmount: deposit.amount, depositId: deposit._id }),
  ]);

  res.json({ message: "Deposit approved", deposit, wallet });
});

export const rejectDeposit = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "Rejected by admin").trim();
  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) {
    throw new ApiError(404, "Deposit request not found");
  }

  if (deposit.status !== "pending") {
    throw new ApiError(400, "Deposit is already processed");
  }

  deposit.status = "failed";
  await deposit.save();

  await Transaction.findOneAndUpdate(
    { "metadata.depositId": deposit._id, type: "deposit" },
    { status: "failed", source: `Deposit rejected: ${reason}` },
    { new: true }
  );

  res.json({ message: "Deposit rejected", deposit });
});

export const listWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.status) {
    query.status = String(req.query.status).toLowerCase();
  }

  const [items, total] = await Promise.all([
    Withdrawal.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Withdrawal.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const approveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
  if (!withdrawal) {
    throw new ApiError(404, "Withdrawal request not found");
  }

  if (withdrawal.status !== "pending") {
    throw new ApiError(400, "Withdrawal is already processed");
  }

  withdrawal.status = "completed";
  withdrawal.approvedAt = new Date();
  withdrawal.reviewedBy = req.user._id;
  await withdrawal.save();

  await Transaction.findOneAndUpdate(
    { "metadata.withdrawalId": withdrawal._id, type: "withdraw" },
    { status: "completed" },
    { new: true }
  );

  res.json({ message: "Withdrawal marked as completed", withdrawal });
});

export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "Rejected by admin").trim();
  const withdrawal = await Withdrawal.findById(req.params.withdrawalId);

  if (!withdrawal) {
    throw new ApiError(404, "Withdrawal request not found");
  }

  if (withdrawal.status !== "pending") {
    throw new ApiError(400, "Withdrawal is already processed");
  }

  const wallet = await Wallet.findOne({ userId: withdrawal.userId });
  if (!wallet) {
    throw new ApiError(404, "Wallet not found for withdrawal user");
  }

  wallet.withdrawalWallet += withdrawal.amount;
  wallet.withdrawTotal = Math.max(0, wallet.withdrawTotal - withdrawal.amount);
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  withdrawal.status = "rejected";
  withdrawal.reviewedBy = req.user._id;
  withdrawal.rejectionReason = reason;
  await withdrawal.save();

  await Transaction.findOneAndUpdate(
    { "metadata.withdrawalId": withdrawal._id, type: "withdraw" },
    { status: "failed", source: `Withdrawal rejected: ${reason}` },
    { new: true }
  );

  res.json({ message: "Withdrawal rejected and amount refunded", withdrawal, wallet });
});

export const listTransactionsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};

  if (req.query.type) {
    query.type = String(req.query.type);
  }

  if (req.query.status) {
    query.status = String(req.query.status);
  }

  if (req.query.userId) {
    query.userId = req.query.userId;
  }

  const [items, total] = await Promise.all([
    Transaction.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getTeamBusiness = asyncHandler(async (req, res) => {
  if (req.query.userId) {
    const user = await User.findById(req.query.userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const result = await computeTeamBusiness(user._id);
    return res.json({
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
      },
      ...result,
      totalTeamBusiness: result.mainLegBusiness + result.otherLegBusiness,
    });
  }

  const { page, limit, skip } = getPagination(req.query);
  const [users, total] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments({}),
  ]);

  const items = [];
  for (const user of users) {
    const result = await computeTeamBusiness(user._id);
    items.push({
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
      },
      mainLegBusiness: result.mainLegBusiness,
      otherLegBusiness: result.otherLegBusiness,
      totalTeamBusiness: result.mainLegBusiness + result.otherLegBusiness,
      referralCount: result.referrals.length,
    });
  }

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
