import Transaction from "../models/Transaction.js";
import Trade from "../models/Trade.js";
import Wallet from "../models/Wallet.js";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { syncTeamBusinessForUserAndUplines } from "./referralController.js";
import { distributeUnilevelIncomeOnTradeStart } from "../services/referralService.js";
import { getDefaultTradeLimit } from "../services/tradeEngineService.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }

  wallet.tradingWallet = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  wallet.tradingBalance = wallet.tradingWallet;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();
  return wallet;
};

export const getWallet = asyncHandler(async (req, res) => {
  const wallet = await ensureWallet(req.user._id);
  res.json({
    wallet: {
      ...wallet.toObject(),
      tradingWallet: Number(wallet.tradingWallet || wallet.tradingBalance || 0),
      tradingIncome: Number(wallet.tradingIncomeWallet || 0),
      referralIncome: Number(wallet.referralIncomeWallet || 0),
      levelIncome: Number(wallet.levelIncomeWallet || 0),
      salaryIncome: Number(wallet.salaryIncomeWallet || 0),
      totalIncome: Number(
        (Number(wallet.tradingIncomeWallet || 0) +
          Number(wallet.referralIncomeWallet || 0) +
          Number(wallet.levelIncomeWallet || 0) +
          Number(wallet.salaryIncomeWallet || 0)).toFixed(6)
      ),
    },
  });
});

export const transferToDepositWallet = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Enter a valid amount");
  }

  const wallet = await ensureWallet(req.user._id);
  if (wallet.withdrawalWallet < amount) {
    throw new ApiError(400, "Insufficient withdrawal wallet balance");
  }

  wallet.withdrawalWallet -= amount;
  wallet.depositWallet += amount;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  await Transaction.create({
    userId: req.user._id,
    type: "wallet_transfer",
    amount,
    network: "INTERNAL",
    source: "Moved funds to deposit wallet",
    status: "completed",
  });

  res.json({
    message: "Funds transferred to deposit wallet",
    wallet,
  });
});

export const depositToWallet = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Enter a valid amount");
  }

  const wallet = await ensureWallet(req.user._id);
  wallet.depositWallet += amount;
  wallet.depositTotal += amount;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const deposit = await Deposit.create({
    userId: req.user._id,
    amount,
    currency: "USDT",
    network: "BEP20",
    status: "confirmed",
  });

  await Transaction.create({
    userId: req.user._id,
    type: "deposit",
    amount,
    network: "BEP20",
    source: "Wallet deposit",
    status: "confirmed",
    metadata: { depositId: deposit._id },
  });

  res.status(201).json({
    message: "Deposit successful",
    wallet,
    deposit,
  });
});

export const withdrawFromWallet = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const pin = String(req.body.pin || "");

  if (!Number.isFinite(amount) || amount < 10) {
    throw new ApiError(400, "Minimum withdraw is $10");
  }

  if (!pin) {
    throw new ApiError(400, "PIN is required");
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

  wallet.withdrawalWallet -= amount;
  wallet.withdrawTotal += amount;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const withdrawal = await Withdrawal.create({
    userId: req.user._id,
    amount,
    destination: req.user.walletAddress,
    network: "BEP20",
    currency: "USDT",
    status: "pending",
  });

  await Transaction.create({
    userId: req.user._id,
    type: "withdraw",
    amount,
    network: "BEP20",
    source: "Wallet withdrawal",
    status: "pending",
    metadata: { withdrawalId: withdrawal._id },
  });

  res.status(201).json({
    message: "Withdrawal submitted",
    wallet,
    withdrawal,
  });
});

export const moveToTradingBalance = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Enter a valid amount");
  }

  const wallet = await ensureWallet(req.user._id);
  if (wallet.depositWallet < amount) {
    throw new ApiError(400, "Insufficient deposit wallet balance");
  }

  wallet.depositWallet -= amount;
  wallet.tradingWallet = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  wallet.tradingWallet += amount;
  wallet.tradingBalance = wallet.tradingWallet;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const trade = await Trade.create({
    userId: req.user._id,
    amount,
    capping: getDefaultTradeLimit(amount),
    investmentLimit: getDefaultTradeLimit(amount),
    status: "active",
  });

  await Transaction.create({
    userId: req.user._id,
    type: "wallet_transfer",
    amount,
    network: "INTERNAL",
    source: "Deposit wallet to trading wallet",
    status: "completed",
    metadata: { tradeId: trade._id, action: "trade_open" },
  });

  await distributeUnilevelIncomeOnTradeStart({
    traderUser: req.user,
    tradeAmount: amount,
    tradeId: trade._id,
  });
  await syncTeamBusinessForUserAndUplines(req.user._id);

  res.status(201).json({
    message: "Amount moved to trading balance",
    wallet,
    trade,
  });
});
