import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import Withdrawal from "../models/Withdrawal.js";
import mongoose from "mongoose";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";

const WITHDRAWAL_CHARGE_PERCENT = 10;

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const createWithdrawal = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const pin = String(req.body.pin || "");
  const currency = String(req.body.currency || "USDT").toUpperCase();
  const network = String(req.body.network || "BEP20").toUpperCase();

  if (!Number.isFinite(amount) || amount < 10) {
    throw new ApiError(400, "Minimum withdraw is $10");
  }

  if (currency !== "USDT") {
    throw new ApiError(400, "Only USDT withdrawals are supported");
  }

  if (network !== "BEP20") {
    throw new ApiError(400, "Only BEP20 network is supported for withdrawals");
  }

  if (!req.user.walletAddress) {
    throw new ApiError(400, "Please bind your USDT BEP20 wallet address first.");
  }

  const validPin = await req.user.comparePin(pin);
  if (!validPin) {
    throw new ApiError(400, "Invalid PIN");
  }

  const wallet = await ensureWallet(req.user._id);
  if (wallet.withdrawalWallet < amount) {
    throw new ApiError(400, "Insufficient withdrawal wallet balance");
  }

  const grossAmount = Number(amount.toFixed(6));
  const feeAmount = Number((grossAmount * (WITHDRAWAL_CHARGE_PERCENT / 100)).toFixed(6));
  const netAmount = Number((grossAmount - feeAmount).toFixed(6));

  wallet.withdrawalWallet -= amount;
  wallet.withdrawTotal += amount;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const withdrawal = await Withdrawal.create({
    userId: req.user._id,
    amount: grossAmount,
    grossAmount,
    feeAmount,
    netAmount,
    chargePercent: WITHDRAWAL_CHARGE_PERCENT,
    destination: req.user.walletAddress,
    network,
    currency,
    status: "pending",
  });

  const transaction = await Transaction.create({
    userId: req.user._id,
    type: "withdraw",
    amount,
    network,
    source: "Withdrawal request",
    status: "pending",
    metadata: {
      withdrawalId: withdrawal._id,
      currency,
      network,
      grossAmount,
      feeAmount,
      netAmount,
      chargePercent: WITHDRAWAL_CHARGE_PERCENT,
    },
  });

  res.status(201).json({
    message: "Withdrawal request submitted",
    withdrawal,
    transactionStatus: transaction.status,
    withdrawalBreakdown: {
      grossAmount,
      feeAmount,
      netAmount,
      chargePercent: WITHDRAWAL_CHARGE_PERCENT,
    },
  });
});

export const listWithdrawalHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { userId: req.user._id };
  const [items, total] = await Promise.all([
    Withdrawal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
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

export const getWithdrawalStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(404, "Withdrawal not found");
  }

  const withdrawal = await Withdrawal.findOne({ _id: req.params.id, userId: req.user._id });
  if (!withdrawal) {
    throw new ApiError(404, "Withdrawal not found");
  }

  const transaction = await Transaction.findOne({
    userId: req.user._id,
    type: "withdraw",
    "metadata.withdrawalId": withdrawal._id,
  }).sort({ createdAt: -1 });

  res.json({
    withdrawalId: withdrawal._id,
    amount: withdrawal.amount,
    grossAmount: Number(withdrawal.grossAmount || withdrawal.amount || 0),
    feeAmount: Number(withdrawal.feeAmount || 0),
    netAmount: Number(withdrawal.netAmount || Math.max(0, Number(withdrawal.amount || 0) - Number(withdrawal.feeAmount || 0))),
    chargePercent: Number(withdrawal.chargePercent || WITHDRAWAL_CHARGE_PERCENT),
    currency: withdrawal.currency,
    network: withdrawal.network,
    destination: withdrawal.destination,
    withdrawalStatus: withdrawal.status,
    transactionStatus: transaction?.status || "pending",
    rejectionReason: withdrawal.rejectionReason,
    createdAt: withdrawal.createdAt,
    updatedAt: withdrawal.updatedAt,
    approvedAt: withdrawal.approvedAt,
  });
});
