import ReferralIncome from "../models/ReferralIncome.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";

const addTransaction = (userId, type, amount, source, status = "completed", metadata = {}, network = "INTERNAL") =>
  Transaction.create({ userId, type, amount, source, status, metadata, network });

export const distributeReferralRewards = async ({ user, depositAmount, depositId }) => {
  return { skipped: true, reason: "Direct and level referral payouts are triggered on trade start" };
};

const getLevelIncomePercent = (level) => {
  if (level === 1) return 20;
  if (level === 2) return 10;
  if (level === 3) return 5;
  if (level >= 4 && level <= 20) return 4;
  if (level >= 21 && level <= 30) return 2;
  return 0;
};

const countActiveDirectReferrals = async (userId) => {
  const sponsor = await User.findById(userId).select("_id userId");
  if (!sponsor) {
    return 0;
  }
  const directUsers = await User.find(
    { $or: [{ referredBy: sponsor._id }, { referredByUserId: sponsor.userId }] },
    "_id"
  );
  if (!directUsers.length) {
    return 0;
  }
  const ids = directUsers.map((entry) => entry._id);
  return Wallet.countDocuments({
    userId: { $in: ids },
    $or: [{ tradingWallet: { $gte: 5 } }, { tradingBalance: { $gte: 5 } }],
  });
};

const hasMinimumInvestmentForLevelIncome = async (userId) => {
  const wallet = await Wallet.findOne({ userId }).select("tradingWallet tradingBalance");
  const tradingAmount = Number(wallet?.tradingWallet || wallet?.tradingBalance || 0);
  return tradingAmount >= 25;
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

export const distributeLevelIncomeOnRoi = async ({ traderUser, roiAmount, tradeId, roiMetadata = {} }) => {
  const amount = Number(roiAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  let currentUser = traderUser;
  for (let level = 1; level <= 30; level += 1) {
    if (!currentUser?.referredBy) {
      break;
    }

    const upline = await User.findById(currentUser.referredBy);
    if (!upline) {
      break;
    }

    const activeDirectCount = await countActiveDirectReferrals(upline._id);
    const unlockedLevels = Math.min(30, activeDirectCount * 3);
    const investmentEligible = await hasMinimumInvestmentForLevelIncome(upline._id);

    if (level <= unlockedLevels && investmentEligible) {
      const percent = getLevelIncomePercent(level);
      const payout = Number((amount * percent / 100).toFixed(6));

      if (payout > 0) {
        const { creditedAmount } = await applyIncomeWithCap({
          userId: upline._id,
          requestedAmount: payout,
          walletField: "levelIncomeWallet",
        });

        if (creditedAmount > 0) {
          await Promise.all([
            addTransaction(
              upline._id,
              "level",
              creditedAmount,
              `Level ${level} income from ROI of ${traderUser.userId || traderUser.email}`,
              "completed",
              { sourceUserId: traderUser._id, tradeId, level, percentage: percent, trigger: "roi", ...roiMetadata }
            ),
            logIncomeEvent({
              userId: upline._id,
              incomeType: "level",
              amount: creditedAmount,
              source: `Level ${level} income from ROI of ${traderUser.userId || traderUser.email}`,
              metadata: { sourceUserId: traderUser._id, tradeId, level, percentage: percent, trigger: "roi", ...roiMetadata },
            }),
            ReferralIncome.create({
              userId: upline._id,
              sourceUserId: traderUser._id,
              tradeId,
              incomeType: "level",
              level,
              amount: creditedAmount,
              metadata: {
                sourceUserId: traderUser.userId,
                sourceEmail: traderUser.email,
                percentage: percent,
                trigger: "roi",
                ...roiMetadata,
              },
            }),
          ]);
        }
      }
    }

    currentUser = upline;
  }
};
