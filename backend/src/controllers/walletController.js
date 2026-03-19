import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { startTradeAndActivate } from "../services/tradeActivationService.js";

const WITHDRAWAL_CHARGE_PERCENT = 10;

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
    metadata: {
      withdrawalId: withdrawal._id,
      grossAmount,
      feeAmount,
      netAmount,
      chargePercent: WITHDRAWAL_CHARGE_PERCENT,
    },
  });

  res.status(201).json({
    message: "Withdrawal submitted",
    wallet,
    withdrawal,
    withdrawalBreakdown: {
      grossAmount,
      feeAmount,
      netAmount,
      chargePercent: WITHDRAWAL_CHARGE_PERCENT,
    },
  });
});

export const moveToTradingBalance = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount < 5) {
    throw new ApiError(400, "Minimum trade amount is $5");
  }

  const wallet = await ensureWallet(req.user._id);
  if (wallet.depositWallet < amount) {
    throw new ApiError(400, "Insufficient deposit wallet balance");
  }
  const { wallet: updatedWallet, trade } = await startTradeAndActivate({
    user: req.user,
    amount,
    activationSource: "wallet_trade_start",
  });

  res.status(201).json({
    message: "Wallet-funded activation completed",
    wallet: updatedWallet,
    trade,
  });
});
