import ReferralIncome from "../models/ReferralIncome.js";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";

const addTransaction = (userId, type, amount, source, status = "completed", metadata = {}, network = "INTERNAL") =>
  Transaction.create({ userId, type, amount, source, status, metadata, network });

export const distributeReferralRewards = async ({ user, depositAmount, depositId }) => {
  return { skipped: true, reason: "Direct and level referral payouts are triggered on trade start" };
};

const resolveSponsorFromTrader = async (traderUser) => {
  if (traderUser?.referredBy) {
    if (mongoose.isValidObjectId(traderUser.referredBy)) {
      const sponsorById = await User.findById(traderUser.referredBy);
      if (sponsorById) return sponsorById;
    }

    const sponsorByLegacyUserId = await User.findOne({ userId: String(traderUser.referredBy).toUpperCase() });
    if (sponsorByLegacyUserId) return sponsorByLegacyUserId;
  }
  if (traderUser?.referredByUserId) {
    const sponsorByUserId = await User.findOne({ userId: String(traderUser.referredByUserId).toUpperCase() });
    if (sponsorByUserId) return sponsorByUserId;
  }
  return null;
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
  const sponsor = await resolveSponsorFromTrader(traderUser);
  if (!sponsor) {
    return { credited: 0 };
  }

  const bonus = Number((Number(tradeAmount || 0) * 0.05).toFixed(6));
  if (!Number.isFinite(bonus) || bonus <= 0) {
    return { credited: 0 };
  }

  const { creditedAmount } = await applyIncomeWithCap({
    userId: sponsor._id,
    requestedAmount: bonus,
    walletField: "referralIncomeWallet",
  });

  if (creditedAmount <= 0) {
    return { credited: 0 };
  }

  await Promise.all([
    addTransaction(
      sponsor._id,
      "REFERRAL",
      creditedAmount,
      `Direct referral bonus from ${traderUser.userId || traderUser.email}`,
      "success",
      {
        sourceUser: traderUser.userId || traderUser.email,
        sourceUserId: traderUser._id,
        tradeId,
        percentage: 5,
        trigger: "trade_start",
      }
    ),
    logIncomeEvent({
      userId: sponsor._id,
      incomeType: "referral",
      amount: creditedAmount,
      source: `Direct referral bonus from ${traderUser.userId || traderUser.email}`,
      metadata: { sourceUser: traderUser.userId, sourceUserId: traderUser._id, tradeId, percentage: 5, trigger: "trade_start" },
    }),
    ReferralIncome.create({
      userId: sponsor._id,
      sourceUserId: traderUser._id,
      tradeId,
      incomeType: "direct",
      level: 1,
      amount: creditedAmount,
      metadata: {
        sourceUserId: traderUser.userId,
        sourceEmail: traderUser.email,
        percentage: 5,
        trigger: "trade_start",
      },
    }),
  ]);

  return { credited: creditedAmount, sponsorId: sponsor._id };
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
