import ReferralIncome from "../models/ReferralIncome.js";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";
import { getIncomeCapState } from "./incomeCapService.js";

const DIRECT_REFERRAL_PERCENT = 5;
const QUALIFYING_SUCCESS_STATUSES = new Set(["success", "completed", "confirmed", "approved", "paid", "active"]);

const toAmount = (value) => Number(Number(value || 0).toFixed(6));
const normalizeStatus = (status) => String(status || "").trim().toLowerCase();

const addTransaction = (userId, type, amount, source, status = "completed", metadata = {}, network = "INTERNAL") =>
  Transaction.create({ userId, type, amount, source, status, metadata, network });

export const distributeReferralRewards = async ({ user, depositAmount, depositId }) => {
  return creditDirectReferralCommission({
    traderUser: user,
    transactionAmount: depositAmount,
    eventType: "deposit_approved",
    eventId: depositId,
    eventStatus: "approved",
    sourceText: `Direct referral bonus from deposit of ${user?.userId || user?.email || "user"}`,
    metadata: {
      trigger: "deposit_approved",
      percentage: DIRECT_REFERRAL_PERCENT,
    },
  });
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

  const status = normalizeStatus(eventStatus);
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
    metadata: {
      ...metadata,
      sourceUserId: traderUser.userId,
      sourceEmail: traderUser.email,
      percentage: DIRECT_REFERRAL_PERCENT,
      event: eventMetadata,
    },
  };

  const eventIdText = eventId ? String(eventId) : "";
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

const getLevelPercentOnTradeStart = (level) => {
  if (level === 1) return 20;
  if (level === 2) return 10;
  if (level === 3) return 5;
  if (level >= 4 && level <= 20) return 4;
  if (level >= 21 && level <= 30) return 2;
  return 0;
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

const distributeLevelReferralOnTradeStart = async ({ traderUser, tradeAmount, tradeId }) => {
  const amount = Number(tradeAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { payouts: 0 };
  }

  let currentUser = traderUser;
  let payouts = 0;

  for (let level = 1; level <= 30; level += 1) {
    const upline = await resolveSponsorFromTrader(currentUser);
    if (!upline) break;

    const alreadyCredited = await ReferralIncome.findOne({
      userId: upline._id,
      sourceUserId: traderUser._id,
      tradeId,
      incomeType: "level",
      level,
      amount: { $gt: 0 },
    }).select("_id");
    if (alreadyCredited) {
      currentUser = upline;
      continue;
    }

    const percent = getLevelPercentOnTradeStart(level);
    const grossPayout = Number(((amount * percent) / 100).toFixed(6));
    if (grossPayout > 0) {
      const { creditedAmount } = await applyIncomeWithCap({
        userId: upline._id,
        requestedAmount: grossPayout,
        walletField: "levelIncomeWallet",
      });

      if (creditedAmount > 0) {
        const sourceText = `Level bonus (L${level}) from ${traderUser.userId || traderUser.email}`;
        await Promise.all([
          addTransaction(
            upline._id,
            "LEVEL",
            creditedAmount,
            sourceText,
            "success",
            {
              trigger: "trade_start",
              level,
              percentage: percent,
              sourceUser: traderUser.userId || traderUser.email,
              sourceUserId: traderUser._id,
              tradeId,
            }
          ),
          logIncomeEvent({
            userId: upline._id,
            incomeType: "level",
            amount: creditedAmount,
            source: sourceText,
            metadata: {
              trigger: "trade_start",
              level,
              percentage: percent,
              sourceUser: traderUser.userId || traderUser.email,
              sourceUserId: traderUser._id,
              tradeId,
            },
          }),
          ReferralIncome.create({
            userId: upline._id,
            sourceUserId: traderUser._id,
            tradeId,
            incomeType: "level",
            level,
            amount: creditedAmount,
            metadata: {
              trigger: "trade_start",
              percentage: percent,
              sourceUserId: traderUser.userId,
              sourceEmail: traderUser.email,
            },
          }),
        ]);
        payouts += 1;
      }
    }

    currentUser = upline;
  }

  return { payouts };
};

export const distributeUnilevelIncomeOnTradeStart = async ({ traderUser, tradeAmount, tradeId }) => {
  const amount = Number(tradeAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const trader =
    (traderUser?._id &&
      mongoose.isValidObjectId(traderUser._id) &&
      (await User.findById(traderUser._id).select("_id userId email referredBy referredByUserId"))) ||
    traderUser;
  if (!trader?._id) {
    return;
  }

  await distributeDirectReferralOnTradeStart({ traderUser: trader, tradeAmount: amount, tradeId });
  await distributeLevelReferralOnTradeStart({ traderUser: trader, tradeAmount: amount, tradeId });
};

export const distributeLevelIncomeOnRoi = async () => {
  return {
    skipped: true,
    reason: "Level income is distributed by 12-hour scheduler from aggregated ROI window.",
  };
};
