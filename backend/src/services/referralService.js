import ReferralIncome from "../models/ReferralIncome.js";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";
import { getIncomeCapState } from "./incomeCapService.js";
import { acquireIdempotencyLock, generateIdempotencyKey } from "./idempotencyService.js";

const DIRECT_REFERRAL_PERCENT = 5;
const QUALIFYING_SUCCESS_STATUSES = new Set(["success", "completed", "confirmed", "approved", "paid", "active"]);
const DIRECT_REFERRAL_ELIGIBLE_EVENTS = new Set(["trade_start"]);

const toAmount = (value) => Number(Number(value || 0).toFixed(6));
const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

const addTransaction = (userId, type, amount, source, status = "completed", metadata = {}, network = "INTERNAL") =>
  Transaction.create({ userId, type, amount, source, status, metadata, network });

export const distributeReferralRewards = async ({ user, depositAmount, depositId }) => {
  return {
    credited: 0,
    skipped: true,
    reason: "deposit_approval_not_eligible",
    eventType: "deposit_approved",
    eventId: depositId || null,
    userId: user?._id || null,
    amount: toAmount(depositAmount),
  };
};

const resolveSponsorFromTrader = async (traderUser, UserModel = User) => {
  if (traderUser?.referredBy) {
    if (mongoose.isValidObjectId(traderUser.referredBy)) {
      const sponsorById = await UserModel.findById(traderUser.referredBy);
      if (sponsorById) return sponsorById;
    }

    const sponsorByLegacyUserId = await UserModel.findOne({ userId: String(traderUser.referredBy).toUpperCase() });
    if (sponsorByLegacyUserId) return sponsorByLegacyUserId;
  }
  if (traderUser?.referredByUserId) {
    const sponsorByUserId = await UserModel.findOne({ userId: String(traderUser.referredByUserId).toUpperCase() });
    if (sponsorByUserId) return sponsorByUserId;
  }
  return null;
};

const getDirectIncomeDuplicateQuery = ({ sponsorId, traderId, eventType, eventId }) => {
  const query = {
    userId: sponsorId,
    sourceUserId: traderId,
    incomeType: "direct",
  };

  const eventIdText = eventId ? String(eventId) : "";
  if (eventType === "trade_start" && eventIdText && mongoose.isValidObjectId(eventIdText)) {
    query.tradeId = new mongoose.Types.ObjectId(eventIdText);
  }

  if (eventType === "deposit_approved" && eventIdText && mongoose.isValidObjectId(eventIdText)) {
    query.depositId = new mongoose.Types.ObjectId(eventIdText);
  }

  if (!query.tradeId && !query.depositId) {
    query["metadata.event"] = {
      type: eventType,
      id: eventIdText,
    };
  }

  return query;
};

export const creditDirectReferralCommission = async ({
  traderUser,
  transactionAmount,
  eventType,
  eventId = null,
  eventStatus = "success",
  dryRun = false,
  sourceText = "",
  metadata = {},
  deps = {},
}) => {
  const logger = deps.logger || console;
  const UserModel = deps.UserModel || User;
  const ReferralIncomeModel = deps.ReferralIncomeModel || ReferralIncome;
  const applyIncomeWithCapFn = deps.applyIncomeWithCapFn || applyIncomeWithCap;
  const getIncomeCapStateFn = deps.getIncomeCapStateFn || getIncomeCapState;
  const addTransactionFn = deps.addTransactionFn || addTransaction;
  const logIncomeEventFn = deps.logIncomeEventFn || logIncomeEvent;
  const acquireIdempotencyLockFn = deps.acquireIdempotencyLockFn || acquireIdempotencyLock;

  const status = normalizeStatus(eventStatus);
  if (!DIRECT_REFERRAL_ELIGIBLE_EVENTS.has(String(eventType || "").trim().toLowerCase())) {
    logger.info(`[referral] skip direct referral commission due to non-eligible event: eventType=${eventType || "unknown"}`);
    return { credited: 0, skipped: true, reason: "non_eligible_event" };
  }

  if (!QUALIFYING_SUCCESS_STATUSES.has(status)) {
    logger.info(
      `[referral] skip direct referral commission due to non-qualifying status: eventType=${eventType} status=${status || "unknown"}`
    );
    return { credited: 0, skipped: true, reason: "non_qualifying_status" };
  }

  if (!traderUser?._id) {
    logger.warn(`[referral] skip direct referral commission due to missing trader user: eventType=${eventType}`);
    return { credited: 0, skipped: true, reason: "missing_trader" };
  }

  const sponsor = await resolveSponsorFromTrader(traderUser, UserModel);
  if (!sponsor?._id) {
    logger.info(
      `[referral] skip direct referral commission due to missing sponsor: trader=${traderUser.userId || traderUser.email || traderUser._id}`
    );
    return { credited: 0, skipped: true, reason: "missing_sponsor" };
  }

  const eventIdText = eventId ? String(eventId) : "";
  const idempotencyKey = generateIdempotencyKey("direct_referral", {
    userId: sponsor._id,
    sourceUserId: traderUser._id,
    eventType: eventType || "unknown",
    eventId: eventIdText || "na",
  });
  if (!dryRun) {
    const lock = await acquireIdempotencyLockFn({ key: idempotencyKey, scope: "direct_referral", deps });
    if (!lock.acquired) {
      logger.info(
        `[referral] skip duplicate direct referral commission (idempotency lock): sponsor=${sponsor.userId || sponsor._id} trader=${traderUser.userId || traderUser._id} eventType=${eventType} eventId=${eventId || "n/a"}`
      );
      return { credited: 0, skipped: true, reason: "duplicate" };
    }
  }

  const duplicateQuery = getDirectIncomeDuplicateQuery({
    sponsorId: sponsor._id,
    traderId: traderUser._id,
    eventType,
    eventId,
  });
  const duplicate = await ReferralIncomeModel.findOne(duplicateQuery);
  if (duplicate) {
    logger.info(
      `[referral] skip duplicate direct referral commission: sponsor=${sponsor.userId || sponsor._id} trader=${traderUser.userId || traderUser._id} eventType=${eventType} eventId=${eventId || "n/a"}`
    );
    return { credited: 0, skipped: true, reason: "duplicate" };
  }

  const baseAmount = toAmount(transactionAmount);
  const bonus = toAmount((baseAmount * DIRECT_REFERRAL_PERCENT) / 100);
  if (!Number.isFinite(bonus) || bonus <= 0) {
    logger.info(
      `[referral] skip direct referral commission due to non-positive amount: trader=${traderUser.userId || traderUser._id} amount=${baseAmount}`
    );
    return { credited: 0, skipped: true, reason: "invalid_amount" };
  }

  let creditedAmount = 0;
  if (dryRun) {
    const capState = await getIncomeCapStateFn(sponsor._id);
    creditedAmount = toAmount(Math.min(bonus, Number(capState.remainingCap || 0)));
  } else {
    const creditResult = await applyIncomeWithCapFn({
      userId: sponsor._id,
      requestedAmount: bonus,
      walletField: "referralIncomeWallet",
      bypassWorkingUserRestriction: true,
    });
    creditedAmount = Number(creditResult.creditedAmount || 0);
  }

  if (creditedAmount <= 0) {
    logger.info(
      `[referral] direct referral commission capped/skipped: sponsor=${sponsor.userId || sponsor._id} trader=${traderUser.userId || traderUser._id} requested=${bonus}`
    );
    return { credited: 0, skipped: true, reason: "cap_or_ineligible", dryRun };
  }

  const eventMetadata = {
    type: eventType || "",
    id: eventId ? String(eventId) : "",
    status,
  };
  const txnSourceText = sourceText || `Direct referral bonus from ${traderUser.userId || traderUser.email}`;

  const referralIncomePayload = {
    userId: sponsor._id,
    sourceUserId: traderUser._id,
    incomeType: "direct",
    level: 1,
    amount: creditedAmount,
    idempotencyKey,
    metadata: {
      ...metadata,
      sourceUserId: traderUser.userId,
      sourceEmail: traderUser.email,
      percentage: DIRECT_REFERRAL_PERCENT,
      event: eventMetadata,
    },
  };

  if (eventType === "trade_start" && eventIdText && mongoose.isValidObjectId(eventIdText)) {
    referralIncomePayload.tradeId = new mongoose.Types.ObjectId(eventIdText);
  }
  if (eventType === "deposit_approved" && eventIdText && mongoose.isValidObjectId(eventIdText)) {
    referralIncomePayload.depositId = new mongoose.Types.ObjectId(eventIdText);
  }

  if (!dryRun) {
    await Promise.all([
      addTransactionFn(sponsor._id, "REFERRAL", creditedAmount, txnSourceText, "success", {
        sourceUser: traderUser.userId || traderUser.email,
        sourceUserId: traderUser._id,
        percentage: DIRECT_REFERRAL_PERCENT,
        event: eventMetadata,
        ...metadata,
      }),
      logIncomeEventFn({
        userId: sponsor._id,
        incomeType: "referral",
        amount: creditedAmount,
        source: txnSourceText,
        metadata: {
          sourceUser: traderUser.userId || traderUser.email,
          sourceUserId: traderUser._id,
          percentage: DIRECT_REFERRAL_PERCENT,
          event: eventMetadata,
          ...metadata,
        },
      }),
      ReferralIncomeModel.create(referralIncomePayload),
    ]);
  }

  logger.info(
    dryRun
      ? `[referral] dry-run direct referral commission eligible: sponsor=${sponsor.userId || sponsor._id} trader=${traderUser.userId || traderUser._id} amount=${creditedAmount} eventType=${eventType} eventId=${eventIdText || "n/a"}`
      : `[referral] credited direct referral commission: sponsor=${sponsor.userId || sponsor._id} trader=${traderUser.userId || traderUser._id} amount=${creditedAmount} eventType=${eventType} eventId=${eventIdText || "n/a"}`
  );

  return { credited: creditedAmount, sponsorId: sponsor._id, skipped: false, dryRun };
};

const distributeDirectReferralOnTradeStart = async ({ traderUser, tradeAmount, tradeId }) => {
  return creditDirectReferralCommission({
    traderUser,
    transactionAmount: tradeAmount,
    eventType: "trade_start",
    eventId: tradeId,
    eventStatus: "success",
    sourceText: `Direct referral bonus from ${traderUser.userId || traderUser.email}`,
    metadata: {
      trigger: "trade_start",
      tradeId,
    },
  });
};

export const distributeUnilevelIncomeOnTradeStart = async ({
  traderUser,
  tradeAmount,
  tradeId,
  deps = {},
}) => {
  const amount = Number(tradeAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const resolveTraderByIdFn =
    deps.resolveTraderByIdFn ||
    (async (id) => User.findById(id).select("_id userId email referredBy referredByUserId"));
  const distributeDirectReferralOnTradeStartFn =
    deps.distributeDirectReferralOnTradeStartFn || distributeDirectReferralOnTradeStart;

  const trader =
    (traderUser?._id && mongoose.isValidObjectId(traderUser._id) && (await resolveTraderByIdFn(traderUser._id))) ||
    traderUser;
  if (!trader?._id) {
    return;
  }

  await distributeDirectReferralOnTradeStartFn({ traderUser: trader, tradeAmount: amount, tradeId });
};

export const distributeLevelIncomeOnRoi = async () => {
  return {
    skipped: true,
    reason: "Level income is distributed by 12-hour scheduler from aggregated ROI window.",
  };
};
