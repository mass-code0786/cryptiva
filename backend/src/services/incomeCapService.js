import Trade from "../models/Trade.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Setting from "../models/Setting.js";
import { acquireDistributedLock, releaseDistributedLock } from "./distributedLockService.js";
import { getActivationInvestmentByUserIds } from "./activationService.js";

const NON_WORKING_CAP_MULTIPLIER = 2.5;
const WORKING_CAP_MULTIPLIER = 4;
const MIN_WORKING_QUALIFIED_DIRECTS = 5;
const QUALIFIED_DIRECT_MIN_INVESTMENT = 100;
const CAP_RESET_SETTING_PREFIX = "income_cap_reset_v2:";
const CAP_APPLY_LOCK_PREFIX = "income_cap_apply_v1:";
const CAP_APPLY_LOCK_TTL_MS = Number(process.env.INCOME_CAP_APPLY_LOCK_TTL_MS || 5000);
const CAP_APPLY_LOCK_RETRY_MS = Number(process.env.INCOME_CAP_APPLY_LOCK_RETRY_MS || 40);
const CAP_APPLY_LOCK_MAX_WAIT_MS = Number(process.env.INCOME_CAP_APPLY_LOCK_MAX_WAIT_MS || 2500);

const ensureWallet = async (userId, WalletModel = Wallet) => {
  let wallet = await WalletModel.findOne({ userId });
  if (!wallet) {
    wallet = await WalletModel.create({ userId });
  }
  return wallet;
};

const toAmount = (value) => Number(Number(value || 0).toFixed(6));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const CAP_INCOME_FIELDS = ["tradingIncomeWallet", "referralIncomeWallet", "levelIncomeWallet", "salaryIncomeWallet"];

const parseCycleTradeId = (cycleId = "") => {
  const text = String(cycleId || "").trim();
  if (!text.startsWith("trade_")) return null;
  const tradeId = text.slice(6);
  if (!mongoose.isValidObjectId(tradeId)) return null;
  return tradeId;
};

const ensureCapCycleMetadata = (wallet, now = new Date()) => {
  if (!wallet || typeof wallet !== "object") return false;

  let changed = false;

  if (!Number.isFinite(Number(wallet.capCycleVersion))) {
    wallet.capCycleVersion = 0;
    changed = true;
  }

  if (!wallet.capCycleIncomeOffset || typeof wallet.capCycleIncomeOffset !== "object") {
    wallet.capCycleIncomeOffset = {};
    changed = true;
  }

  for (const field of CAP_INCOME_FIELDS) {
    if (!Number.isFinite(Number(wallet.capCycleIncomeOffset[field]))) {
      wallet.capCycleIncomeOffset[field] = 0;
      changed = true;
    }
  }

  if (!wallet.capCycleStartedAt && Number(wallet.capCycleVersion || 0) > 0) {
    wallet.capCycleStartedAt = now;
    changed = true;
  }

  return changed;
};

const getCycleIncomeBreakdown = (wallet) => {
  const offsets = wallet?.capCycleIncomeOffset || {};
  const breakdown = {};
  for (const field of CAP_INCOME_FIELDS) {
    const walletValue = toAmount(wallet?.[field] || 0);
    const offsetValue = toAmount(offsets[field] || 0);
    breakdown[field] = toAmount(Math.max(0, walletValue - offsetValue));
  }
  return breakdown;
};

const acquireCapApplyLockWithRetry = async ({ userId, deps = {}, logger = console } = {}) => {
  const acquireCapLockFn = deps.acquireCapLockFn || acquireDistributedLock;
  const lockKey = `${CAP_APPLY_LOCK_PREFIX}${String(userId)}`;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= CAP_APPLY_LOCK_MAX_WAIT_MS) {
    const lock = await acquireCapLockFn({
      key: lockKey,
      ttlMs: CAP_APPLY_LOCK_TTL_MS,
      deps,
    });

    if (lock?.acquired) {
      return lock;
    }

    await sleep(CAP_APPLY_LOCK_RETRY_MS);
  }

  logger.warn(`[income-cap] cap apply lock timeout: user=${String(userId)} waitMs=${CAP_APPLY_LOCK_MAX_WAIT_MS}`);
  return null;
};

export const getQualifiedDirectCountForWorkingUser = async (userId, deps = {}) => {
  const UserModel = deps.UserModel || User;
  const getActivationInvestmentByUserIdsFn = deps.getActivationInvestmentByUserIdsFn || getActivationInvestmentByUserIds;

  if (!mongoose.isValidObjectId(userId)) {
    return 0;
  }

  const baseUser = await UserModel.findById(userId).select("_id userId");
  if (!baseUser) {
    return 0;
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
    return 0;
  }

  const referralIds = directReferrals.map((entry) => entry._id);
  const investmentByUserId = await getActivationInvestmentByUserIdsFn(referralIds, { TradeModel: deps.TradeModel || Trade });
  let qualifiedDirectCount = 0;
  for (const referralId of referralIds) {
    const totalInvestment = Number(investmentByUserId.get(String(referralId)) || 0);
    if (totalInvestment >= QUALIFIED_DIRECT_MIN_INVESTMENT) {
      qualifiedDirectCount += 1;
    }
  }

  return qualifiedDirectCount;
};

const getCapMultiplier = (workingUser) => (workingUser ? WORKING_CAP_MULTIPLIER : NON_WORKING_CAP_MULTIPLIER);

const resolveIncomeCapResetCycleId = async ({ userId, boundaryAt = null, deps = {} } = {}) => {
  const TradeModel = deps.TradeModel || Trade;
  const query = {
    userId,
    amount: { $gt: 0 },
  };
  if (boundaryAt instanceof Date && !Number.isNaN(boundaryAt.getTime())) {
    query.createdAt = { $lte: boundaryAt };
  }

  const latestPositiveTrade = await TradeModel.findOne({
    ...query,
  })
    .sort({ createdAt: -1 })
    .select("_id createdAt");

  if (latestPositiveTrade?._id) {
    return `trade_${String(latestPositiveTrade._id)}`;
  }

  return "no_capital";
};

export const executeCapitalResetOnCapReached = async ({
  userId,
  reason = "income_cap_reached",
  cycleId = "",
  boundaryAt = null,
  deps = {},
} = {}) => {
  const logger = deps.logger || console;
  const SettingModel = deps.SettingModel || Setting;
  const TradeModel = deps.TradeModel || Trade;
  const WalletModel = deps.WalletModel || Wallet;
  const now = new Date();
  const resetBoundaryAt =
    boundaryAt instanceof Date && !Number.isNaN(boundaryAt.getTime()) ? boundaryAt : now;
  const resolvedCycleId =
    String(cycleId || (await resolveIncomeCapResetCycleId({ userId, boundaryAt: resetBoundaryAt, deps })) || "no_capital").trim() ||
    "no_capital";
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

  const tradeBoundaryId = parseCycleTradeId(resolvedCycleId);
  const closeTradesQuery = {
    userId,
    status: "active",
    createdAt: { $lte: resetBoundaryAt },
  };
  if (tradeBoundaryId) {
    closeTradesQuery._id = { $lte: new mongoose.Types.ObjectId(tradeBoundaryId) };
  }

  const [tradeUpdateResult, wallet] = await Promise.all([
    TradeModel.updateMany(closeTradesQuery, { $set: { status: "completed", amount: 0, closedAt: now, lastSettledAt: now } }),
    ensureWallet(userId, WalletModel),
  ]);
  const activeTradesQuery = TradeModel.find({ userId, status: "active" });
  const activeTrades =
    activeTradesQuery && typeof activeTradesQuery.select === "function"
      ? await activeTradesQuery.select("amount")
      : await activeTradesQuery;

  const activePrincipal = toAmount(
    (Array.isArray(activeTrades) ? activeTrades : []).reduce((sum, trade) => sum + Number(trade?.amount || 0), 0)
  );
  ensureCapCycleMetadata(wallet, now);
  wallet.capCycleVersion = Number(wallet.capCycleVersion || 0) + 1;
  wallet.capCycleStartedAt = now;
  wallet.capCycleIncomeOffset = {
    tradingIncomeWallet: toAmount(wallet.tradingIncomeWallet || 0),
    referralIncomeWallet: toAmount(wallet.referralIncomeWallet || 0),
    levelIncomeWallet: toAmount(wallet.levelIncomeWallet || 0),
    salaryIncomeWallet: toAmount(wallet.salaryIncomeWallet || 0),
  };
  wallet.tradingWallet = activePrincipal;
  wallet.tradingBalance = activePrincipal;
  wallet.balance = toAmount((wallet.depositWallet || 0) + (wallet.withdrawalWallet || 0));
  await wallet.save();

  const activeTradesClosed = Number(tradeUpdateResult?.modifiedCount || 0);
  logger.warn(
    `[income-cap] capital reset executed: user=${String(userId)} cycle=${resolvedCycleId} activeTradesClosed=${activeTradesClosed} tradingCapitalAfterReset=${activePrincipal}`
  );
  return { executed: true, alreadyExecuted: false, activeTradesClosed, cycleId: resolvedCycleId };
};

export const getIncomeCapState = async (userId, deps = {}) => {
  const WalletModel = deps.WalletModel || Wallet;
  const logger = deps.logger || console;
  const getQualifiedDirectCountFn =
    deps.getQualifiedDirectCountFn || deps.getQualifiedDirectCountForWorkingUserFn || getQualifiedDirectCountForWorkingUser;

  const wallet = await ensureWallet(userId, WalletModel);
  const metadataChanged = ensureCapCycleMetadata(wallet);
  if (metadataChanged) {
    await wallet.save();
  }
  const investmentBase = toAmount(wallet.tradingWallet || wallet.tradingBalance || 0);
  const qualifiedDirectCount = Number(
    deps.hasActiveReferralFn
      ? (await deps.hasActiveReferralFn(userId, deps)) ? MIN_WORKING_QUALIFIED_DIRECTS : 0
      : await getQualifiedDirectCountFn(userId, deps)
  );
  const workingUser = qualifiedDirectCount >= MIN_WORKING_QUALIFIED_DIRECTS;
  const multiplier = getCapMultiplier(workingUser);
  const maxCap = toAmount(investmentBase * multiplier);

  const cycleIncome = getCycleIncomeBreakdown(wallet);
  const tradingIncome = toAmount(cycleIncome.tradingIncomeWallet);
  const referralIncome = toAmount(cycleIncome.referralIncomeWallet);
  const levelIncome = toAmount(cycleIncome.levelIncomeWallet);
  const salaryIncome = toAmount(cycleIncome.salaryIncomeWallet);
  const totalIncome = toAmount(tradingIncome + referralIncome + levelIncome + salaryIncome);
  const remainingCap = toAmount(Math.max(0, maxCap - totalIncome));

  logger.info(
    `[income-cap] working-user check: user=${String(userId)} qualifiedDirectCount=${qualifiedDirectCount} isWorkingUser=${workingUser} capMultiplier=${multiplier}`
  );

  return {
    wallet,
    investmentBase,
    qualifiedDirectCount,
    workingUser,
    capMultiplier: multiplier,
    maxCap,
    capCycleVersion: Number(wallet.capCycleVersion || 0),
    capCycleStartedAt: wallet.capCycleStartedAt || null,
    totalIncome,
    cycleIncome,
    remainingCap,
  };
};

export const applyIncomeWithCap = async ({ userId, requestedAmount, walletField, bypassWorkingUserRestriction = false, deps = {} }) => {
  const logger = deps.logger || console;
  const executeCapitalResetOnCapReachedFn = deps.executeCapitalResetOnCapReachedFn || executeCapitalResetOnCapReached;
  const releaseCapLockFn = deps.releaseCapLockFn || releaseDistributedLock;
  let capitalReset = null;
  let capApplyLock = null;

  const amount = toAmount(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { creditedAmount: 0, capReached: false, state: await getIncomeCapState(userId, deps), capitalReset: null };
  }

  try {
    capApplyLock = await acquireCapApplyLockWithRetry({ userId, deps, logger });
    if (!capApplyLock?.acquired) {
      throw new Error(`Unable to acquire income-cap apply lock for user=${String(userId)}`);
    }

    const state = await getIncomeCapState(userId, deps);
    const capReachedBeforeCredit = state.remainingCap <= 0 || (state.maxCap > 0 && state.totalIncome >= state.maxCap);
    if (capReachedBeforeCredit) {
      const capDetectedAt = new Date();
      logger.warn(`[income-cap] cap reached: user=${String(userId)} maxCap=${state.maxCap} totalIncome=${state.totalIncome}`);
      capitalReset = await executeCapitalResetOnCapReachedFn({
        userId,
        reason: "cap_reached_no_credit",
        boundaryAt: capDetectedAt,
        deps,
      });
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
      const capDetectedAt = new Date();
      logger.warn(
        `[income-cap] cap reached on credit: user=${String(userId)} maxCap=${state.maxCap} totalBefore=${state.totalIncome} credited=${creditedAmount}`
      );
      capitalReset = await executeCapitalResetOnCapReachedFn({
        userId,
        reason: "cap_reached_on_credit",
        boundaryAt: capDetectedAt,
        deps,
      });
    }

    return { creditedAmount, capReached, state, capitalReset };
  } finally {
    if (capApplyLock?.acquired) {
      await releaseCapLockFn({ key: capApplyLock.key, owner: capApplyLock.owner, deps }).catch((error) => {
        logger.warn(`[income-cap] failed to release cap apply lock: user=${String(userId)} error=${error?.message || error}`);
      });
    }
  }
};
