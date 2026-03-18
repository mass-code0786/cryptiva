import mongoose from "mongoose";
import dotenv from "dotenv";

import IncomeLog from "../src/models/IncomeLog.js";
import Deposit from "../src/models/Deposit.js";
import ReferralIncome from "../src/models/ReferralIncome.js";
import Trade from "../src/models/Trade.js";
import Transaction from "../src/models/Transaction.js";
import User from "../src/models/User.js";
import Wallet from "../src/models/Wallet.js";
import ActivityLog from "../src/models/ActivityLog.js";
import { MONGO_URI } from "../src/config/env.js";
import { activateUserById } from "../src/services/activationService.js";
import { applyIncomeWithCap } from "../src/services/incomeCapService.js";
import { logIncomeEvent } from "../src/services/incomeLogService.js";
import { syncTeamBusinessForUser, syncTeamBusinessForUserAndUplines } from "../src/controllers/referralController.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number.parseInt(LIMIT_ARG.split("=")[1], 10) || 0) : 0;

const ACTIVE_TRADE_STATUSES = ["active", "completed"];
const SUCCESS_STATUSES = ["completed", "confirmed", "success", "approved"];
const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const LEVEL_PERCENT_BY_LEVEL = (level) => {
  if (level === 1) return 20;
  if (level === 2) return 10;
  if (level === 3) return 5;
  if (level >= 4 && level <= 20) return 4;
  if (level >= 21 && level <= 30) return 2;
  return 0;
};

const findSponsor = async (user) => {
  if (user?.referredBy) {
    if (mongoose.isValidObjectId(user.referredBy)) {
      const sponsorById = await User.findById(user.referredBy).select("_id userId email referredBy referredByUserId");
      if (sponsorById) return sponsorById;
    }
    const sponsorByLegacy = await User.findOne({ userId: String(user.referredBy).toUpperCase() }).select(
      "_id userId email referredBy referredByUserId"
    );
    if (sponsorByLegacy) return sponsorByLegacy;
  }
  if (user?.referredByUserId) {
    return User.findOne({ userId: String(user.referredByUserId).toUpperCase() }).select("_id userId email referredBy referredByUserId");
  }
  return null;
};

const collectAffectedUsers = async () => {
  const [tradeAgg, depositAgg, depositTxnAgg, adminTransferTxnAgg, walletAgg, adminActivationLogAgg] = await Promise.all([
    Trade.aggregate([
      { $match: { status: { $in: ACTIVE_TRADE_STATUSES } } },
      { $group: { _id: "$userId", totalInvestment: { $sum: "$amount" }, tradeCount: { $sum: 1 } } },
      { $match: { totalInvestment: { $gt: 0 } } },
    ]),
    Deposit.aggregate([
      { $match: { status: { $in: ["approved", "confirmed"] }, amount: { $gt: 0 } } },
      { $group: { _id: "$userId", totalApprovedDeposits: { $sum: "$amount" }, approvedDepositCount: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { type: "deposit", status: { $in: SUCCESS_STATUSES }, amount: { $gt: 0 } } },
      { $group: { _id: "$userId", totalDepositTransactions: { $sum: "$amount" }, depositTransactionCount: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          type: "admin_transfer",
          status: { $in: SUCCESS_STATUSES },
          amount: { $gt: 0 },
        },
      },
      { $group: { _id: "$userId", totalAdminTransfer: { $sum: "$amount" }, adminTransferCount: { $sum: 1 } } },
    ]),
    Wallet.aggregate([
      {
        $match: {
          $or: [{ depositTotal: { $gt: 0 } }, { tradingWallet: { $gt: 0 } }, { tradingBalance: { $gt: 0 } }],
        },
      },
      {
        $group: {
          _id: "$userId",
          depositTotal: { $max: "$depositTotal" },
          tradingWallet: { $max: "$tradingWallet" },
          tradingBalance: { $max: "$tradingBalance" },
        },
      },
    ]),
    ActivityLog.aggregate([
      {
        $match: {
          $or: [
            { type: "admin_transfer" },
            { action: { $regex: "Fund transferred", $options: "i" } },
            { action: { $regex: "user activated", $options: "i" } },
          ],
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$targetUserId", "$userId"] },
          activationLogCount: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
    ]),
  ]);

  const evidenceMap = new Map();
  const ensureEvidence = (userId) => {
    const key = String(userId);
    if (!evidenceMap.has(key)) {
      evidenceMap.set(key, {
        tradeCount: 0,
        totalInvestment: 0,
        approvedDepositCount: 0,
        totalApprovedDeposits: 0,
        depositTransactionCount: 0,
        totalDepositTransactions: 0,
        adminTransferCount: 0,
        totalAdminTransfer: 0,
        walletDepositTotal: 0,
        walletTradingBalance: 0,
        activationLogCount: 0,
      });
    }
    return evidenceMap.get(key);
  };

  for (const row of tradeAgg) {
    const item = ensureEvidence(row._id);
    item.tradeCount = Number(row.tradeCount || 0);
    item.totalInvestment = Number(row.totalInvestment || 0);
  }
  for (const row of depositAgg) {
    const item = ensureEvidence(row._id);
    item.approvedDepositCount = Number(row.approvedDepositCount || 0);
    item.totalApprovedDeposits = Number(row.totalApprovedDeposits || 0);
  }
  for (const row of depositTxnAgg) {
    const item = ensureEvidence(row._id);
    item.depositTransactionCount = Number(row.depositTransactionCount || 0);
    item.totalDepositTransactions = Number(row.totalDepositTransactions || 0);
  }
  for (const row of adminTransferTxnAgg) {
    const item = ensureEvidence(row._id);
    item.adminTransferCount = Number(row.adminTransferCount || 0);
    item.totalAdminTransfer = Number(row.totalAdminTransfer || 0);
  }
  for (const row of walletAgg) {
    const item = ensureEvidence(row._id);
    item.walletDepositTotal = Number(row.depositTotal || 0);
    item.walletTradingBalance = Number(row.tradingWallet || row.tradingBalance || 0);
  }
  for (const row of adminActivationLogAgg) {
    const item = ensureEvidence(row._id);
    item.activationLogCount = Number(row.activationLogCount || 0);
  }

  const userIds = Array.from(evidenceMap.keys()).filter((id) => mongoose.isValidObjectId(id));
  if (!userIds.length) return [];

  const query = {
    _id: { $in: userIds },
    $or: [
      { isActive: { $ne: true } },
      { mlmEligible: { $ne: true } },
      { packageActive: { $ne: true } },
      { packageStatus: { $ne: "active" } },
    ],
  };

  const users = await User.find(query).select(
    "_id userId email referredBy referredByUserId isActive mlmEligible packageActive packageStatus"
  );

  const merged = users.map((user) => ({
    user,
    stats: evidenceMap.get(String(user._id)) || {
      tradeCount: 0,
      totalInvestment: 0,
      approvedDepositCount: 0,
      totalApprovedDeposits: 0,
      depositTransactionCount: 0,
      totalDepositTransactions: 0,
      adminTransferCount: 0,
      totalAdminTransfer: 0,
      walletDepositTotal: 0,
      walletTradingBalance: 0,
      activationLogCount: 0,
    },
  }));

  if (!LIMIT) return merged;
  return merged.slice(0, LIMIT);
};

const backfillDirectReferralForTrades = async ({ user, dryRun }) => {
  const sponsor = await findSponsor(user);
  if (!sponsor) {
    return { scannedTrades: 0, created: 0, skippedExisting: 0, skippedCap: 0, skippedNoSponsor: 0 };
  }

  const trades = await Trade.find({ userId: user._id, status: { $in: ACTIVE_TRADE_STATUSES } }).select("_id amount createdAt");
  let created = 0;
  let skippedExisting = 0;
  let skippedCap = 0;

  for (const trade of trades) {
    const existing = await ReferralIncome.findOne({
      incomeType: "direct",
      userId: sponsor._id,
      sourceUserId: user._id,
      tradeId: trade._id,
      amount: { $gt: 0 },
    }).select("_id");

    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const directBonus = toAmount(Number(trade.amount || 0) * 0.05);
    if (directBonus <= 0) continue;

    if (dryRun) {
      created += 1;
      continue;
    }

    const { creditedAmount } = await applyIncomeWithCap({
      userId: sponsor._id,
      requestedAmount: directBonus,
      walletField: "referralIncomeWallet",
    });

    if (creditedAmount <= 0) {
      skippedCap += 1;
      continue;
    }

    const sourceText = `Activation repair: direct referral bonus from ${user.userId || user.email}`;
    await Promise.all([
      Transaction.create({
        userId: sponsor._id,
        type: "REFERRAL",
        amount: creditedAmount,
        network: "INTERNAL",
        source: sourceText,
        status: "success",
        metadata: {
          trigger: "repair_activation_backfill",
          sourceUser: user.userId || user.email,
          sourceUserId: user._id,
          tradeId: trade._id,
          percentage: 5,
        },
      }),
      logIncomeEvent({
        userId: sponsor._id,
        incomeType: "referral",
        amount: creditedAmount,
        source: sourceText,
        metadata: {
          trigger: "repair_activation_backfill",
          sourceUser: user.userId || user.email,
          sourceUserId: user._id,
          tradeId: trade._id,
          percentage: 5,
        },
        recordedAt: trade.createdAt || new Date(),
      }),
      ReferralIncome.create({
        userId: sponsor._id,
        sourceUserId: user._id,
        tradeId: trade._id,
        incomeType: "direct",
        level: 1,
        amount: creditedAmount,
        metadata: {
          trigger: "repair_activation_backfill",
          sourceUserId: user.userId,
          sourceEmail: user.email,
          percentage: 5,
        },
      }),
    ]);

    created += 1;
  }

  return { scannedTrades: trades.length, created, skippedExisting, skippedCap, skippedNoSponsor: 0 };
};

const backfillLevelIncomeFromRoiIfMissing = async ({ user, dryRun }) => {
  const existingLevelCount = await ReferralIncome.countDocuments({
    incomeType: "level",
    sourceUserId: user._id,
    amount: { $gt: 0 },
  });

  if (existingLevelCount > 0) {
    return { skippedBecauseExisting: true, roiLogs: 0, creditedRows: 0, skippedCap: 0 };
  }

  const roiLogs = await IncomeLog.find({
    userId: user._id,
    incomeType: "trading",
    amount: { $gt: 0 },
  }).select("_id amount recordedAt");

  let creditedRows = 0;
  let skippedCap = 0;

  for (const roiLog of roiLogs) {
    let current = user;
    for (let level = 1; level <= 30; level += 1) {
      const upline = await findSponsor(current);
      if (!upline) break;

      const percent = LEVEL_PERCENT_BY_LEVEL(level);
      const payout = toAmount((Number(roiLog.amount || 0) * percent) / 100);
      if (payout > 0) {
        if (dryRun) {
          creditedRows += 1;
        } else {
          const { creditedAmount } = await applyIncomeWithCap({
            userId: upline._id,
            requestedAmount: payout,
            walletField: "levelIncomeWallet",
          });

          if (creditedAmount > 0) {
            const sourceText = `Activation repair: level income from ROI of ${user.userId || user.email}`;
            await Promise.all([
              Transaction.create({
                userId: upline._id,
                type: "LEVEL",
                amount: creditedAmount,
                network: "INTERNAL",
                source: sourceText,
                status: "success",
                metadata: {
                  trigger: "repair_activation_backfill",
                  level,
                  percentage: percent,
                  sourceUser: user.userId || user.email,
                  sourceUserId: user._id,
                  roiIncomeLogId: roiLog._id,
                },
              }),
              logIncomeEvent({
                userId: upline._id,
                incomeType: "level",
                amount: creditedAmount,
                source: sourceText,
                metadata: {
                  trigger: "repair_activation_backfill",
                  level,
                  percentage: percent,
                  sourceUser: user.userId || user.email,
                  sourceUserId: user._id,
                  roiIncomeLogId: roiLog._id,
                },
                recordedAt: roiLog.recordedAt || new Date(),
              }),
              ReferralIncome.create({
                userId: upline._id,
                sourceUserId: user._id,
                tradeId: null,
                incomeType: "level",
                level,
                amount: creditedAmount,
                metadata: {
                  trigger: "repair_activation_backfill",
                  percentage: percent,
                  sourceUser: user.userId || user.email,
                  roiIncomeLogId: roiLog._id,
                },
              }),
            ]);
            creditedRows += 1;
          } else {
            skippedCap += 1;
          }
        }
      }

      current = upline;
    }
  }

  return { skippedBecauseExisting: false, roiLogs: roiLogs.length, creditedRows, skippedCap };
};

const main = async () => {
  console.log(APPLY ? "Running activation repair in APPLY mode" : "Running activation repair in DRY-RUN mode");
  if (LIMIT) console.log(`User limit: ${LIMIT}`);

  await mongoose.connect(MONGO_URI);
  try {
    const affected = await collectAffectedUsers();
    console.log(`Affected users found: ${affected.length}`);

    const summary = {
      activatedUsers: 0,
      directCreated: 0,
      levelCreated: 0,
      levelSkippedExisting: 0,
      scannedTrades: 0,
      roiLogs: 0,
    };

    for (const row of affected) {
      const user = row.user;
      const tradeStats = row.stats;
      console.log(
        `- ${user.userId} (${user.email}) | trades=${tradeStats.tradeCount}/${toAmount(tradeStats.totalInvestment)} depositApproved=${
          tradeStats.approvedDepositCount
        }/${toAmount(tradeStats.totalApprovedDeposits)} depositTx=${tradeStats.depositTransactionCount}/${toAmount(
          tradeStats.totalDepositTransactions
        )} adminTransfer=${tradeStats.adminTransferCount}/${toAmount(tradeStats.totalAdminTransfer)} wallet(depositTotal=${toAmount(
          tradeStats.walletDepositTotal
        )},trading=${toAmount(tradeStats.walletTradingBalance)}) adminActivationLogs=${tradeStats.activationLogCount} | isActive=${Boolean(
          user.isActive
        )} mlmEligible=${Boolean(user.mlmEligible)}`
      );

      if (APPLY) {
        await activateUserById({ userId: user._id, source: "repair_script" });
        await syncTeamBusinessForUser(user._id);
        await syncTeamBusinessForUserAndUplines(user._id);
      }
      summary.activatedUsers += 1;

      const direct = await backfillDirectReferralForTrades({ user, dryRun: !APPLY });
      summary.scannedTrades += direct.scannedTrades;
      summary.directCreated += direct.created;

      const level = await backfillLevelIncomeFromRoiIfMissing({ user, dryRun: !APPLY });
      summary.roiLogs += level.roiLogs;
      summary.levelCreated += level.creditedRows;
      if (level.skippedBecauseExisting) summary.levelSkippedExisting += 1;
    }

    console.log("Summary:");
    console.log(`- Users processed: ${summary.activatedUsers}`);
    console.log(`- Trades scanned for direct backfill: ${summary.scannedTrades}`);
    console.log(`- Direct incomes backfilled: ${summary.directCreated}`);
    console.log(`- ROI logs scanned for level backfill: ${summary.roiLogs}`);
    console.log(`- Level incomes backfilled: ${summary.levelCreated}`);
    console.log(`- Users skipped for level backfill (already had level rows): ${summary.levelSkippedExisting}`);
    if (!APPLY) {
      console.log("Dry-run complete. Re-run with --apply to execute updates.");
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Activation repair failed", error);
  process.exit(1);
});
