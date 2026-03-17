import ReferralIncome from "../models/ReferralIncome.js";
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
    let sponsorById = null;
    try {
      sponsorById = await User.findById(traderUser.referredBy);
    } catch {
      sponsorById = null;
    }
    if (sponsorById) return sponsorById;

    const sponsorByLegacyUserId = await User.findOne({ userId: String(traderUser.referredBy).toUpperCase() });
    if (sponsorByLegacyUserId) return sponsorByLegacyUserId;
  }
  if (traderUser?.referredByUserId) {
    const sponsorByUserId = await User.findOne({ userId: String(traderUser.referredByUserId).toUpperCase() });
    if (sponsorByUserId) return sponsorByUserId;
  }
  return null;
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

export const distributeUnilevelIncomeOnTradeStart = async ({ traderUser, tradeAmount, tradeId }) => {
  const amount = Number(tradeAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const trader =
    (traderUser?._id && (await User.findById(traderUser._id).select("_id userId email referredBy referredByUserId"))) || traderUser;
  if (!trader?._id) {
    return;
  }

  await distributeDirectReferralOnTradeStart({ traderUser: trader, tradeAmount: amount, tradeId });
};

export const distributeLevelIncomeOnRoi = async () => {
  return {
    skipped: true,
    reason: "Level income is distributed by 12-hour scheduler from aggregated ROI window.",
  };
};
