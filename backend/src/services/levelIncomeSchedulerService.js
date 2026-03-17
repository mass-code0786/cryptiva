import IncomeLog from "../models/IncomeLog.js";
import ReferralIncome from "../models/ReferralIncome.js";
import Setting from "../models/Setting.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { applyIncomeWithCap } from "./incomeCapService.js";
import { logIncomeEvent } from "./incomeLogService.js";

const LEVEL_INCOME_INTERVAL_MS = 12 * 60 * 60 * 1000;
const LEVEL_INCOME_TICK_MS = LEVEL_INCOME_INTERVAL_MS;
const LEVEL_INCOME_LAST_RUN_KEY = "levelIncomeLastRunAt";

let levelIncomeTimer = null;
let levelIncomeRunning = false;

const getLevelIncomePercent = (level) => {
  if (level === 1) return 20;
  if (level === 2) return 10;
  if (level === 3) return 5;
  if (level >= 4 && level <= 20) return 4;
  if (level >= 21 && level <= 30) return 2;
  return 0;
};

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const getLastRunAt = async () => {
  const setting = await Setting.findOne({ key: LEVEL_INCOME_LAST_RUN_KEY });
  if (!setting?.valueString) {
    return null;
  }
  const parsed = new Date(setting.valueString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const setLastRunAt = async (date) => {
  await Setting.findOneAndUpdate(
    { key: LEVEL_INCOME_LAST_RUN_KEY },
    {
      key: LEVEL_INCOME_LAST_RUN_KEY,
      valueString: date.toISOString(),
      valueNumber: date.getTime(),
      metadata: { updatedAt: new Date().toISOString() },
    },
    { upsert: true, new: true }
  );
};

const buildUserResolvers = () => {
  const byIdCache = new Map();
  const byUserIdCache = new Map();

  const getById = async (id) => {
    const key = String(id || "");
    if (!key) return null;
    if (byIdCache.has(key)) return byIdCache.get(key);
    const user = await User.findById(key).select("_id userId email referredBy referredByUserId");
    byIdCache.set(key, user || null);
    if (user?.userId) byUserIdCache.set(user.userId, user);
    return user || null;
  };

  const getByUserId = async (userId) => {
    const key = String(userId || "");
    if (!key) return null;
    if (byUserIdCache.has(key)) return byUserIdCache.get(key);
    const user = await User.findOne({ userId: key }).select("_id userId email referredBy referredByUserId");
    byUserIdCache.set(key, user || null);
    if (user?._id) byIdCache.set(String(user._id), user);
    return user || null;
  };

  return { getById, getByUserId };
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

export const runLevelIncomeDistribution12h = async (windowEnd = new Date()) => {
  const endAt = windowEnd instanceof Date ? windowEnd : new Date(windowEnd);
  if (Number.isNaN(endAt.getTime())) {
    throw new Error("Invalid window end time");
  }

  const lastRunAt = await getLastRunAt();
  const startAt = lastRunAt || new Date(endAt.getTime() - LEVEL_INCOME_INTERVAL_MS);

  const roiAgg = await IncomeLog.aggregate([
    {
      $match: {
        incomeType: "trading",
        amount: { $gt: 0 },
        recordedAt: { $gt: startAt, $lte: endAt },
      },
    },
    {
      $group: {
        _id: "$userId",
        totalRoi: { $sum: "$amount" },
        roiRecords: { $sum: 1 },
      },
    },
  ]);

  if (!roiAgg.length) {
    await setLastRunAt(endAt);
    return {
      windowStart: startAt,
      windowEnd: endAt,
      roiLogs: 0,
      roiUsers: 0,
      payouts: 0,
      creditedUsers: 0,
    };
  }

  const resolvers = buildUserResolvers();
  const payoutCountByUser = new Map();
  let payouts = 0;

  for (const roiUser of roiAgg) {
    const roiAmount = toAmount(roiUser.totalRoi);
    if (roiAmount <= 0) {
      continue;
    }

    let currentUser = await resolvers.getById(roiUser._id);
    if (!currentUser) continue;

    for (let level = 1; level <= 30; level += 1) {
      const upline = await resolveUpline(currentUser, resolvers);
      if (!upline) break;

      const percent = getLevelIncomePercent(level);
      const payout = toAmount((roiAmount * percent) / 100);
      if (payout > 0) {
        const { creditedAmount } = await applyIncomeWithCap({
          userId: upline._id,
          requestedAmount: payout,
          walletField: "levelIncomeWallet",
        });

        if (creditedAmount > 0) {
          payouts += 1;
          const uplineKey = String(upline._id);
          payoutCountByUser.set(uplineKey, (payoutCountByUser.get(uplineKey) || 0) + 1);

          const sourceText = `12h level income from ROI of ${currentUser.userId || currentUser.email}`;
          await Promise.all([
            Transaction.create({
              userId: upline._id,
              type: "LEVEL",
              amount: creditedAmount,
              network: "INTERNAL",
              source: sourceText,
              status: "success",
              metadata: {
                trigger: "roi_12h",
                level,
                percentage: percent,
                sourceUser: currentUser.userId || currentUser.email,
                sourceUserId: currentUser._id,
                tradeId: null,
                roiWindowTotal: roiAmount,
                roiWindowRecords: roiUser.roiRecords,
                windowStart: startAt,
                windowEnd: endAt,
                date: endAt.toISOString().slice(0, 10),
                time: endAt.toISOString().slice(11, 19),
              },
            }),
            logIncomeEvent({
              userId: upline._id,
              incomeType: "level",
              amount: creditedAmount,
              source: sourceText,
              metadata: {
                trigger: "roi_12h",
                level,
                percentage: percent,
                sourceUser: currentUser.userId || currentUser.email,
                sourceUserId: currentUser._id,
                tradeId: null,
                roiWindowTotal: roiAmount,
                roiWindowRecords: roiUser.roiRecords,
                windowStart: startAt,
                windowEnd: endAt,
              },
              recordedAt: endAt,
            }),
            ReferralIncome.create({
              userId: upline._id,
              sourceUserId: currentUser._id,
              tradeId: null,
              incomeType: "level",
              level,
              amount: creditedAmount,
              metadata: {
                trigger: "roi_12h",
                percentage: percent,
                sourceUser: currentUser.userId || currentUser.email,
                roiWindowTotal: roiAmount,
                roiWindowRecords: roiUser.roiRecords,
                windowStart: startAt,
                windowEnd: endAt,
              },
            }),
          ]);
        }
      }

      currentUser = upline;
    }
  }

  await setLastRunAt(endAt);
  return {
    windowStart: startAt,
    windowEnd: endAt,
    roiLogs: roiAgg.reduce((sum, entry) => sum + Number(entry.roiRecords || 0), 0),
    roiUsers: roiAgg.length,
    payouts,
    creditedUsers: payoutCountByUser.size,
  };
};

const shouldRunNow = async (now = new Date()) => {
  const lastRunAt = await getLastRunAt();
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= LEVEL_INCOME_INTERVAL_MS;
};

const runLevelIncomeTick = async () => {
  if (levelIncomeRunning) return;

  const now = new Date();
  const runNow = await shouldRunNow(now);
  if (!runNow) return;

  levelIncomeRunning = true;
  try {
    const result = await runLevelIncomeDistribution12h(now);
    console.log(
      `[LevelIncomeScheduler] 12h run done: roiLogs=${result.roiLogs}, payouts=${result.payouts}, users=${result.creditedUsers}`
    );
  } catch (error) {
    console.error("[LevelIncomeScheduler] 12h run failed", error);
  } finally {
    levelIncomeRunning = false;
  }
};

export const startLevelIncomeScheduler = () => {
  if (levelIncomeTimer) return;

  levelIncomeTimer = setInterval(() => {
    runLevelIncomeTick().catch((error) => {
      console.error("[LevelIncomeScheduler] Tick failed", error);
    });
  }, LEVEL_INCOME_TICK_MS);

  runLevelIncomeTick().catch((error) => {
    console.error("[LevelIncomeScheduler] Initial tick failed", error);
  });
};
