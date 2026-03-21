import mongoose from "mongoose";
import ReferralIncome from "../models/ReferralIncome.js";
import Transaction from "../models/Transaction.js";
import Trade from "../models/Trade.js";
import User from "../models/User.js";
import { getActivationInvestmentByUserIds } from "./activationService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { acquireIdempotencyLock, generateIdempotencyKey } from "./idempotencyService.js";

export const getLevelIncomePercent = (level) => {
  if (level === 1) return 12;
  if (level === 2) return 8;
  if (level === 3) return 5;
  if (level >= 4 && level <= 20) return 4;
  if (level >= 21 && level <= 30) return 2;
  return 0;
};

const toAmount = (value) => Number(Number(value || 0).toFixed(6));
const MAX_UNLOCKED_LEVEL = 30;
const LEVELS_PER_QUALIFIED_DIRECT = 2;
const QUALIFIED_DIRECT_MIN_INVESTMENT = 100;

export const computeUnlockedLevelsFromQualifiedDirects = (qualifiedDirectCount) =>
  Math.min(Math.max(0, Number(qualifiedDirectCount) || 0) * LEVELS_PER_QUALIFIED_DIRECT, MAX_UNLOCKED_LEVEL);

const buildUserResolvers = (UserModel = User) => {
  const byIdCache = new Map();
  const byUserIdCache = new Map();

  const getById = async (id) => {
    const key = String(id || "");
    if (!key) return null;
    if (byIdCache.has(key)) return byIdCache.get(key);
    if (!mongoose.isValidObjectId(key)) {
      const byUserId = await getByUserId(key);
      byIdCache.set(key, byUserId || null);
      return byUserId || null;
    }

    const user = await UserModel.findById(key).select("_id userId email referredBy referredByUserId");
    byIdCache.set(key, user || null);
    if (user?.userId) byUserIdCache.set(user.userId, user);
    return user || null;
  };

  const getByUserId = async (userId) => {
    const key = String(userId || "").toUpperCase();
    if (!key) return null;
    if (byUserIdCache.has(key)) return byUserIdCache.get(key);
    const user = await UserModel.findOne({ userId: key }).select("_id userId email referredBy referredByUserId");
    byUserIdCache.set(key, user || null);
    if (user?._id) byIdCache.set(String(user._id), user);
    return user || null;
  };

  return { getById, getByUserId };
};

export const buildQualifiedDirectCountResolver = ({ UserModel = User, TradeModel = Trade, getActivationInvestmentByUserIdsFn = getActivationInvestmentByUserIds } = {}) => {
  const countCache = new Map();

  return async (uplineUser) => {
    const uplineId = String(uplineUser?._id || "");
    if (!uplineId) return 0;
    if (countCache.has(uplineId)) return countCache.get(uplineId);

    const directReferrals = await UserModel.find(
      {
        $or: [{ referredBy: uplineUser._id }, { referredByUserId: uplineUser.userId }],
      },
      "_id"
    );
    if (!directReferrals.length) {
      countCache.set(uplineId, 0);
      return 0;
    }

    const referralIds = directReferrals.map((entry) => entry._id);
    const investmentByUserId = await getActivationInvestmentByUserIdsFn(referralIds, { TradeModel });

    let count = 0;
    for (const referralId of referralIds) {
      const totalInvestment = Number(investmentByUserId.get(String(referralId)) || 0);
      if (totalInvestment >= QUALIFIED_DIRECT_MIN_INVESTMENT) {
        count += 1;
      }
    }

    countCache.set(uplineId, count);
    return count;
  };
};

const resolveUpline = async (currentUser, resolvers) => {
  if (!currentUser) return null;
  if (currentUser.referredBy) {
    const byId = await resolvers.getById(currentUser.referredBy);
    if (byId) return byId;
  }
  if (currentUser.referredByUserId) {
    const byUserId = await resolvers.getByUserId(currentUser.referredByUserId);
    if (byUserId) return byUserId;
  }
  return null;
};

export const distributeLevelIncomeOnTradingCredit = async ({
  traderUserId,
  traderTradeId = null,
  roiAmount,
  roiEventKey,
  recordedAt = new Date(),
  deps = {},
}) => {
  const logger = deps.logger || console;
  const amount = toAmount(roiAmount);
  const eventKey = String(roiEventKey || "").trim();
  if (!traderUserId || !eventKey || amount <= 0) {
    return { payouts: 0, creditedUsers: 0, skipped: true, reason: "invalid_input" };
  }

  const ReferralIncomeModel = deps.ReferralIncomeModel || ReferralIncome;
  const TransactionModel = deps.TransactionModel || Transaction;
  const applyIncomeWithCapFn = deps.applyIncomeWithCapFn || applyIncomeWithCap;
  const logIncomeEventFn = deps.logIncomeEventFn || logIncomeEvent;
  const resolvers = deps.resolvers || buildUserResolvers(deps.UserModel || User);
  const getQualifiedDirectCountFn =
    deps.getQualifiedDirectCountFn ||
    deps.getActiveDirectCountFn ||
    buildQualifiedDirectCountResolver({
      UserModel: deps.UserModel || User,
      TradeModel: deps.TradeModel || Trade,
      getActivationInvestmentByUserIdsFn: deps.getActivationInvestmentByUserIdsFn || getActivationInvestmentByUserIds,
    });
  const acquireIdempotencyLockFn = deps.acquireIdempotencyLockFn || acquireIdempotencyLock;

  let currentUser = await resolvers.getById(traderUserId);
  if (!currentUser?._id) {
    return { payouts: 0, creditedUsers: 0, skipped: true, reason: "missing_trader" };
  }

  const payoutCountByUser = new Map();
  let payouts = 0;

  for (let level = 1; level <= 30; level += 1) {
    const upline = await resolveUpline(currentUser, resolvers);
    if (!upline) break;

    const qualifiedDirectCount = Number(await getQualifiedDirectCountFn(upline)) || 0;
    const maxUnlockedLevel = computeUnlockedLevelsFromQualifiedDirects(qualifiedDirectCount);
    logger.info(
      `[level-income] unlock check: user=${upline.userId || String(upline._id)} qualifiedDirectCount=${qualifiedDirectCount} unlockedLevel=${maxUnlockedLevel} targetLevel=${level}`
    );
    if (level > maxUnlockedLevel) {
      currentUser = upline;
      continue;
    }

    const alreadyCredited = await ReferralIncomeModel.findOne({
      userId: upline._id,
      sourceUserId: currentUser._id,
      incomeType: "level",
      level,
      "metadata.trigger": "roi_realtime",
      "metadata.roiEventKey": eventKey,
      amount: { $gt: 0 },
    }).select("_id");
    if (alreadyCredited) {
      currentUser = upline;
      continue;
    }

    const percent = getLevelIncomePercent(level);
    const payout = toAmount((amount * percent) / 100);
    if (payout > 0) {
      const idempotencyKey = generateIdempotencyKey("level_roi_realtime", {
        userId: upline._id,
        sourceUserId: currentUser._id,
        eventType: "roi_realtime",
        eventId: eventKey,
        level,
      });
      const lock = await acquireIdempotencyLockFn({ key: idempotencyKey, scope: "level_roi_realtime", deps });
      if (!lock.acquired) {
        currentUser = upline;
        continue;
      }

      const { creditedAmount } = await applyIncomeWithCapFn({
        userId: upline._id,
        requestedAmount: payout,
        walletField: "levelIncomeWallet",
      });

      if (creditedAmount > 0) {
        payouts += 1;
        const uplineKey = String(upline._id);
        payoutCountByUser.set(uplineKey, (payoutCountByUser.get(uplineKey) || 0) + 1);

        const sourceText = `Realtime level income from ROI of ${currentUser.userId || currentUser.email}`;
        await Promise.all([
          TransactionModel.create({
            userId: upline._id,
            type: "LEVEL",
            amount: creditedAmount,
            network: "INTERNAL",
            source: sourceText,
            status: "success",
            metadata: {
              trigger: "roi_realtime",
              level,
              percentage: percent,
              sourceUser: currentUser.userId || currentUser.email,
              sourceUserId: currentUser._id,
              tradeId: traderTradeId || null,
              roiAmount: amount,
              roiEventKey: eventKey,
            },
          }),
          logIncomeEventFn({
            userId: upline._id,
            incomeType: "level",
            amount: creditedAmount,
            source: sourceText,
            metadata: {
              trigger: "roi_realtime",
              level,
              percentage: percent,
              sourceUser: currentUser.userId || currentUser.email,
              sourceUserId: currentUser._id,
              tradeId: traderTradeId || null,
              roiAmount: amount,
              roiEventKey: eventKey,
            },
            recordedAt,
          }),
          ReferralIncomeModel.create({
            userId: upline._id,
            sourceUserId: currentUser._id,
            tradeId: traderTradeId || null,
            incomeType: "level",
            level,
            amount: creditedAmount,
            idempotencyKey,
            metadata: {
              trigger: "roi_realtime",
              percentage: percent,
              sourceUser: currentUser.userId || currentUser.email,
              roiAmount: amount,
              roiEventKey: eventKey,
            },
          }),
        ]);
      }
    }

    currentUser = upline;
  }

  return {
    payouts,
    creditedUsers: payoutCountByUser.size,
  };
};

export const runLevelIncomeDistribution12h = async () => {
  return {
    skipped: true,
    reason: "12-hour level income distribution is disabled; realtime ROI-event distribution is active.",
    payouts: 0,
    creditedUsers: 0,
  };
};

export const startLevelIncomeScheduler = () => {
  return;
};
