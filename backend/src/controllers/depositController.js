import crypto from "crypto";

import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { distributeReferralRewards } from "../services/referralService.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

const createPaymentPayload = (amount) => {
  const paymentId = crypto.randomUUID();
  const addressSuffix = crypto.randomBytes(8).toString("hex");
  const paymentUrl = `https://pay.cryptiva.local/checkout/${paymentId}`;
  const payAddress = `0x${addressSuffix}${crypto.randomBytes(12).toString("hex")}`;

  return {
    payment_id: paymentId,
    payment_url: paymentUrl,
    pay_address: payAddress,
    qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(paymentUrl)}`,
    amount,
  };
};

const addTransaction = (userId, type, amount, source, status = "completed", metadata = {}, network = "BEP20") =>
  Transaction.create({ userId, type, amount, source, status, metadata, network });

export const createDeposit = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const currency = String(req.body.currency || "USDT").toUpperCase();
  const network = String(req.body.network || "BEP20").toUpperCase();
  const txHash = String(req.body.txHash || "").trim();

  if (!req.user.walletAddress) {
    throw new ApiError(400, "Please bind your USDT BEP20 wallet address first.");
  }

  if (!Number.isFinite(amount) || amount < 5) {
    throw new ApiError(400, "Minimum deposit is $5");
  }

  if (currency !== "USDT") {
    throw new ApiError(400, "Only USDT deposits are supported");
  }

  if (network !== "BEP20") {
    throw new ApiError(400, "Only BEP20 network is supported for deposits");
  }

  const payment = createPaymentPayload(amount);
  const deposit = await Deposit.create({
    userId: req.user._id,
    amount,
    currency,
    network,
    status: "pending",
    txHash,
    payment,
  });

  const transaction = await addTransaction(req.user._id, "deposit", amount, "Deposit request", "pending", {
    depositId: deposit._id,
    txHash,
    currency,
    network,
  });

  res.status(201).json({
    message: "Deposit request created",
    deposit,
    transactionStatus: transaction.status,
    payment,
  });
});

export const listDepositHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { userId: req.user._id };
  const [items, total] = await Promise.all([
    Deposit.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Deposit.countDocuments(query),
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

export const getDepositStatus = asyncHandler(async (req, res) => {
  const deposit = await Deposit.findOne({ _id: req.params.id, userId: req.user._id });
  if (!deposit) {
    throw new ApiError(404, "Deposit not found");
  }

  const transaction = await Transaction.findOne({
    userId: req.user._id,
    type: "deposit",
    "metadata.depositId": deposit._id,
  }).sort({ createdAt: -1 });

  res.json({
    depositId: deposit._id,
    amount: deposit.amount,
    currency: deposit.currency,
    network: deposit.network,
    txHash: deposit.txHash,
    depositStatus: deposit.status,
    transactionStatus: transaction?.status || "pending",
    createdAt: deposit.createdAt,
    updatedAt: deposit.updatedAt,
  });
});

export const handleDepositWebhook = asyncHandler(async (req, res) => {
  res.json({
    received: true,
    message: "Webhook endpoint is available. Automatic provider verification is not configured in this scaffold.",
    payload: req.body,
  });
});
