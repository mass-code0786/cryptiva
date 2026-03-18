import Trade from "../models/Trade.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

export const hasActiveReferral = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    return false;
  }

  const baseUser = await User.findById(userId).select("_id userId");
  if (!baseUser) {
    return false;
  }

  const directReferrals = await User.find(
    {
      $or: [
        { referredBy: baseUser._id },
        { referredByUserId: baseUser.userId },
      ],
    },
    "_id"
  );
  if (!directReferrals.length) {
    return false;
  }

  const referralIds = directReferrals.map((entry) => entry._id);
  const activeTrade = await Trade.findOne({
    userId: { $in: referralIds },
    amount: { $gte: 5 },
    status: { $in: ["active", "completed"] },
  }).select("_id");

  return Boolean(activeTrade);
};

export const getIncomeCapState = async (userId) => {
  const wallet = await ensureWallet(userId);
  const investmentBase = toAmount(wallet.tradingWallet || wallet.tradingBalance || 0);
  const workingUser = await hasActiveReferral(userId);
  const multiplier = workingUser ? 6 : 3;
  const maxCap = toAmount(investmentBase * multiplier);

  const tradingIncome = toAmount(wallet.tradingIncomeWallet);
  const referralIncome = toAmount(wallet.referralIncomeWallet);
  const levelIncome = toAmount(wallet.levelIncomeWallet);
  const salaryIncome = toAmount(wallet.salaryIncomeWallet);
  const totalIncome = toAmount(tradingIncome + referralIncome + levelIncome + salaryIncome);
  const remainingCap = toAmount(Math.max(0, maxCap - totalIncome));

  return {
    wallet,
    investmentBase,
    workingUser,
    maxCap,
    totalIncome,
    remainingCap,
  };
};

export const applyIncomeWithCap = async ({ userId, requestedAmount, walletField, bypassWorkingUserRestriction = false }) => {
  const amount = toAmount(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { creditedAmount: 0, capReached: false, state: await getIncomeCapState(userId) };
  }

  const state = await getIncomeCapState(userId);
  const nonTradingIncome = walletField !== "tradingIncomeWallet";
  if (!state.workingUser && nonTradingIncome && !bypassWorkingUserRestriction) {
    return { creditedAmount: 0, capReached: false, state };
  }
  const creditedAmount = toAmount(Math.min(amount, state.remainingCap));
  const capReached = state.remainingCap <= 0;

  if (creditedAmount <= 0) {
    return { creditedAmount: 0, capReached: true, state };
  }

  state.wallet[walletField] = toAmount(state.wallet[walletField] || 0) + creditedAmount;
  state.wallet.withdrawalWallet = toAmount(state.wallet.withdrawalWallet || 0) + creditedAmount;
  state.wallet.balance = toAmount((state.wallet.depositWallet || 0) + (state.wallet.withdrawalWallet || 0));
  await state.wallet.save();

  return { creditedAmount, capReached, state };
};
