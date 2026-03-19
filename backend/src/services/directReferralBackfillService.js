import mongoose from "mongoose";

import Deposit from "../models/Deposit.js";
import Trade from "../models/Trade.js";
import User from "../models/User.js";
import { creditDirectReferralCommission } from "./referralService.js";

const DEPOSIT_SUCCESS_STATUSES = ["approved", "confirmed"];
const TRADE_SUCCESS_STATUSES = ["active", "completed"];

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const parseSources = (sourcesRaw) => {
  const raw = Array.isArray(sourcesRaw) ? sourcesRaw : String(sourcesRaw || "all").split(",");
  const parsed = new Set(
    raw
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean)
      .flatMap((entry) => (entry === "all" ? ["trades"] : [entry]))
  );

  const sources = [];
  if (parsed.has("trades")) sources.push("trades");
  return sources.length ? sources : ["trades"];
};

const buildDateMatch = ({ from = null, to = null } = {}) => {
  if (!from && !to) return null;
  const match = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) {
      match.$gte = parsed;
    }
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) {
      match.$lte = parsed;
    }
  }
  return Object.keys(match).length ? match : null;
};

const findTraderUser = async (userId, { UserModel, cache }) => {
  const key = String(userId);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const user = await UserModel.findById(userId).select("_id userId email referredBy referredByUserId");
  cache.set(key, user || null);
  return user || null;
};

const processDeposit = async ({ deposit, traderUser, dryRun, logger, creditFn }) => {
  logger.info(`[backfill:direct] skip deposit=${deposit._id} because deposit-approved direct referral is disabled`);
  return { category: "skipped_non_eligible_event", credited: 0 };
};

const processTrade = async ({ trade, traderUser, dryRun, logger, creditFn }) => {
  if (!traderUser?._id) {
    logger.warn(`[backfill:direct] skip trade=${trade._id} due to missing user`);
    return { category: "skipped_missing_user", credited: 0 };
  }

  const amount = toAmount(trade.amount);
  if (!(amount > 0)) {
    return { category: "skipped_invalid_amount", credited: 0 };
  }

  const result = await creditFn({
    traderUser,
    transactionAmount: amount,
    eventType: "trade_start",
    eventId: trade._id,
    eventStatus: trade.status,
    dryRun,
    sourceText: `Direct referral backfill from activation of ${traderUser.userId || traderUser.email}`,
    metadata: {
      trigger: "backfill_direct_referral_trade",
      tradeId: trade._id,
      originalCreatedAt: trade.createdAt,
    },
  });

  return {
    category: result.skipped ? `skipped_${result.reason}` : "credited",
    credited: Number(result.credited || 0),
  };
};

const increment = (summary, key) => {
  summary.counters[key] = Number(summary.counters[key] || 0) + 1;
};

export const backfillDirectReferralIncome = async ({
  dryRun = true,
  sources = "all",
  limit = 0,
  from = null,
  to = null,
  userId = null,
  deps = {},
} = {}) => {
  const logger = deps.logger || console;
  const DepositModel = deps.DepositModel || Deposit;
  const TradeModel = deps.TradeModel || Trade;
  const UserModel = deps.UserModel || User;
  const creditFn = deps.creditFn || creditDirectReferralCommission;

  const chosenSources = parseSources(sources);
  const dateMatch = buildDateMatch({ from, to });
  const userFilter = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(String(userId)) : null;

  const summary = {
    dryRun,
    sources: chosenSources,
    scanned: 0,
    creditedCount: 0,
    creditedAmount: 0,
    counters: {},
  };

  const userCache = new Map();

  if (chosenSources.includes("deposits")) {
    const depositQuery = {
      status: { $in: DEPOSIT_SUCCESS_STATUSES },
      amount: { $gt: 0 },
    };
    if (dateMatch) depositQuery.createdAt = dateMatch;
    if (userFilter) depositQuery.userId = userFilter;

    const deposits = await DepositModel.find(depositQuery).sort({ createdAt: 1 }).limit(limit > 0 ? limit : 0);

    for (const deposit of deposits) {
      summary.scanned += 1;
      const traderUser = await findTraderUser(deposit.userId, { UserModel, cache: userCache });
      const row = await processDeposit({ deposit, traderUser, dryRun, logger, creditFn });
      increment(summary, row.category);
      if (row.category === "credited") {
        summary.creditedCount += 1;
        summary.creditedAmount = toAmount(summary.creditedAmount + row.credited);
      }
    }
  }

  if (chosenSources.includes("trades")) {
    const tradeQuery = {
      status: { $in: TRADE_SUCCESS_STATUSES },
      amount: { $gt: 0 },
    };
    if (dateMatch) tradeQuery.createdAt = dateMatch;
    if (userFilter) tradeQuery.userId = userFilter;

    const trades = await TradeModel.find(tradeQuery).sort({ createdAt: 1 }).limit(limit > 0 ? limit : 0);

    for (const trade of trades) {
      summary.scanned += 1;
      const traderUser = await findTraderUser(trade.userId, { UserModel, cache: userCache });
      const row = await processTrade({ trade, traderUser, dryRun, logger, creditFn });
      increment(summary, row.category);
      if (row.category === "credited") {
        summary.creditedCount += 1;
        summary.creditedAmount = toAmount(summary.creditedAmount + row.credited);
      }
    }
  }

  return summary;
};
