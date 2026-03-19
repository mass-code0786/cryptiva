import Trade from "../models/Trade.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Setting from "../models/Setting.js";

const NON_WORKING_CAP_MULTIPLIER = 2.5;
const WORKING_CAP_MULTIPLIER = 4;
const CAP_RESET_SETTING_PREFIX = "income_cap_reset_v2:";

const ensureWallet = async (userId, WalletModel = Wallet) => {
  let wallet = await WalletModel.findOne({ userId });
  if (!wallet) {
    wallet = await WalletModel.create({ userId });
  }
  return wallet;
};

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

export const hasActiveReferral = async (userId, deps = {}) => {
  const UserModel = deps.UserModel || User;
  const TradeModel = deps.TradeModel || Trade;

  if (!mongoose.isValidObjectId(userId)) {
    return false;
  }

  const baseUser = await UserModel.findById(userId).select("_id userId");
  if (!baseUser) {
    return false;
  }

  const directReferrals = await UserModel.find(
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
  const activeTrade = await TradeModel.findOne({
    userId: { $in: referralIds },
    amount: { $gte: 5 },
    status: { $in: ["active", "completed"] },
  }).select("_id");

  return Boolean(activeTrade);
};

const getCapMultiplier = (workingUser) => (workingUser ? WORKING_CAP_MULTIPLIER : NON_WORKING_CAP_MULTIPLIER);

const resolveIncomeCapResetCycleId = async ({ userId, deps = {} } = {}) => {
  const TradeModel = deps.TradeModel || Trade;
  const latestPositiveTrade = await TradeModel.findOne({
    userId,
    amount: { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .select("_id createdAt");

  if (latestPositiveTrade?._id) {
    return `trade_${String(latestPositiveTrade._id)}`;
  }

  return "no_capital";
};

export const executeCapitalResetOnCapReached = async ({ userId, reason = "income_cap_reached", cycleId = "", deps = {} } = {}) => {
  const logger = deps.logger || console;
  const SettingModel = deps.SettingModel || Setting;
  const TradeModel = deps.TradeModel || Trade;
  const WalletModel = deps.WalletModel || Wallet;
  const now = new Date();
  const resolvedCycleId = String(cycleId || (await resolveIncomeCapResetCycleId({ userId, deps })) || "no_capital").trim() || "no_capital";
  const key = `${CAP_RESET_SETTING_PREFIX}${String(userId)}:${resolvedCycleId}`;

  const lockResult = await SettingModel.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        valueString: now.toISOString(),
        valueNumber: now.getTime(),
        metadata: {
          status: "completed",
          trigger: reason,
          cycleId: resolvedCycleId,
          userId: String(userId),
          resetAt: now.toISOString(),
        },
      },
    },
    { upsert: true }
  );

  const lockAcquired = Number(lockResult.upsertedCount || 0) > 0 || Boolean(lockResult.upsertedId);
  if (!lockAcquired) {
    logger.info(`[income-cap] reset already executed: user=${String(userId)} cycle=${resolvedCycleId}`);
    return { executed: false, alreadyExecuted: true, activeTradesClosed: 0 };
  }

  const [tradeUpdateResult, wallet] = await Promise.all([
    TradeModel.updateMany(
      { userId, status: "active" },
      { $set: { status: "completed", amount: 0, closedAt: now, lastSettledAt: now } }
    ),
    ensureWallet(userId, WalletModel),
  ]);

  wallet.tradingWallet = 0;
  wallet.tradingBalance = 0;
  wallet.balance = toAmount((wallet.depositWallet || 0) + (wallet.withdrawalWallet || 0));
  await wallet.save();

  const activeTradesClosed = Number(tradeUpdateResult?.modifiedCount || 0);
  logger.warn(
    `[income-cap] capital reset executed: user=${String(userId)} cycle=${resolvedCycleId} activeTradesClosed=${activeTradesClosed} tradingCapitalSetTo=0`
  );
  return { executed: true, alreadyExecuted: false, activeTradesClosed, cycleId: resolvedCycleId };
};

export const getIncomeCapState = async (userId, deps = {}) => {
  const WalletModel = deps.WalletModel || Wallet;
  const hasActiveReferralFn = deps.hasActiveReferralFn || hasActiveReferral;

  const wallet = await ensureWallet(userId, WalletModel);
  const investmentBase = toAmount(wallet.tradingWallet || wallet.tradingBalance || 0);
  const workingUser = await hasActiveReferralFn(userId, deps);
  const multiplier = getCapMultiplier(workingUser);
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

export const applyIncomeWithCap = async ({ userId, requestedAmount, walletField, bypassWorkingUserRestriction = false, deps = {} }) => {
  const logger = deps.logger || console;
  const executeCapitalResetOnCapReachedFn = deps.executeCapitalResetOnCapReachedFn || executeCapitalResetOnCapReached;
  let capitalReset = null;

  const amount = toAmount(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { creditedAmount: 0, capReached: false, state: await getIncomeCapState(userId, deps), capitalReset: null };
  }

  const state = await getIncomeCapState(userId, deps);
  const capReachedBeforeCredit = state.remainingCap <= 0 || (state.maxCap > 0 && state.totalIncome >= state.maxCap);
  if (capReachedBeforeCredit) {
    logger.warn(`[income-cap] cap reached: user=${String(userId)} maxCap=${state.maxCap} totalIncome=${state.totalIncome}`);
    capitalReset = await executeCapitalResetOnCapReachedFn({ userId, reason: "cap_reached_no_credit", deps });
    return { creditedAmount: 0, capReached: true, state, capitalReset };
  }

  const nonTradingIncome = walletField !== "tradingIncomeWallet";
  if (!state.workingUser && nonTradingIncome && !bypassWorkingUserRestriction) {
    return { creditedAmount: 0, capReached: false, state, capitalReset: null };
  }

  const creditedAmount = toAmount(Math.min(amount, state.remainingCap));
  const totalAfterCredit = toAmount(state.totalIncome + creditedAmount);
  const capReachedAfterCredit = state.maxCap > 0 && totalAfterCredit >= state.maxCap;
  const capReached = capReachedAfterCredit;

  if (creditedAmount <= 0) {
    return { creditedAmount: 0, capReached, state, capitalReset };
  }

  state.wallet[walletField] = toAmount(state.wallet[walletField] || 0) + creditedAmount;
  state.wallet.withdrawalWallet = toAmount(state.wallet.withdrawalWallet || 0) + creditedAmount;
  state.wallet.balance = toAmount((state.wallet.depositWallet || 0) + (state.wallet.withdrawalWallet || 0));
  await state.wallet.save();

  if (capReachedAfterCredit) {
    logger.warn(
      `[income-cap] cap reached on credit: user=${String(userId)} maxCap=${state.maxCap} totalBefore=${state.totalIncome} credited=${creditedAmount}`
    );
    capitalReset = await executeCapitalResetOnCapReachedFn({ userId, reason: "cap_reached_on_credit", deps });
  }

  return { creditedAmount, capReached, state, capitalReset };
};
