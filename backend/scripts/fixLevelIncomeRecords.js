import mongoose from "mongoose";
import dotenv from "dotenv";

import IncomeLog from "../src/models/IncomeLog.js";
import Transaction from "../src/models/Transaction.js";
import ReferralIncome from "../src/models/ReferralIncome.js";
import User from "../src/models/User.js";
import Wallet from "../src/models/Wallet.js";
import { MONGO_URI } from "../src/config/env.js";

dotenv.config();

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const getLevelPercent = (level) => {
  if (level === 1) return 20;
  if (level === 2) return 10;
  if (level === 3) return 5;
  if (level >= 4 && level <= 20) return 4;
  if (level >= 21 && level <= 30) return 2;
  return 0;
};

const invalidLevelCriteria = {
  incomeType: "level",
  $or: [{ "metadata.trigger": { $exists: false } }, { "metadata.trigger": { $ne: "roi" } }],
};

const invalidLevelTxCriteria = {
  type: "level",
  $or: [{ "metadata.trigger": { $exists: false } }, { "metadata.trigger": { $ne: "roi" } }],
};

const validRoiLevelCriteria = {
  incomeType: "level",
  "metadata.trigger": { $in: ["roi", "correction_roi"] },
};

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

const updateWalletForLevelDelta = async (userId, delta) => {
  if (!Number.isFinite(delta) || delta === 0) return;
  const wallet = await ensureWallet(userId);
  wallet.levelIncomeWallet = toAmount(Math.max(0, Number(wallet.levelIncomeWallet || 0) + delta));
  wallet.withdrawalWallet = toAmount(Math.max(0, Number(wallet.withdrawalWallet || 0) + delta));
  wallet.balance = toAmount(Number(wallet.depositWallet || 0) + Number(wallet.withdrawalWallet || 0));
  await wallet.save();
};

const aggregateByUser = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const userId = row.userId.toString();
    const current = map.get(userId) || 0;
    map.set(userId, toAmount(current + Number(row.amount || 0)));
  }
  return map;
};

const recomputeExpectedLevelByRoi = async () => {
  const [users, tradingRoiLogs] = await Promise.all([
    User.find({}, "_id referredBy"),
    IncomeLog.find({ incomeType: "trading" }, "userId amount metadata recordedAt"),
  ]);

  const parentMap = new Map(users.map((u) => [u._id.toString(), u.referredBy ? u.referredBy.toString() : null]));
  const expectedMap = new Map();

  for (const roi of tradingRoiLogs) {
    const roiAmount = Number(roi.amount || 0);
    if (!Number.isFinite(roiAmount) || roiAmount <= 0) continue;

    let currentUserId = roi.userId.toString();
    for (let level = 1; level <= 30; level += 1) {
      const uplineId = parentMap.get(currentUserId);
      if (!uplineId) break;

      const pct = getLevelPercent(level);
      const levelAmount = toAmount((roiAmount * pct) / 100);
      const prev = expectedMap.get(uplineId) || 0;
      expectedMap.set(uplineId, toAmount(prev + levelAmount));

      currentUserId = uplineId;
    }
  }

  return expectedMap;
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "Running level income correction in APPLY mode" : "Running level income correction in DRY-RUN mode");

  await mongoose.connect(MONGO_URI);

  try {
    const [invalidIncomeLogs, invalidTransactions, invalidReferralRows] = await Promise.all([
      IncomeLog.find(invalidLevelCriteria, "_id userId amount"),
      Transaction.find(invalidLevelTxCriteria, "_id userId amount"),
      ReferralIncome.find(
        {
          incomeType: "level",
          $or: [{ "metadata.trigger": { $exists: false } }, { "metadata.trigger": { $ne: "roi" } }],
        },
        "_id userId amount"
      ),
    ]);

    const invalidByUser = aggregateByUser(invalidIncomeLogs);
    const totalInvalid = Array.from(invalidByUser.values()).reduce((sum, val) => toAmount(sum + val), 0);

    const expectedByUser = await recomputeExpectedLevelByRoi();
    const validLevelLogs = await IncomeLog.find(validRoiLevelCriteria, "userId amount");
    const currentValidByUser = aggregateByUser(validLevelLogs);

    const correctionByUser = new Map();
    for (const [userId, expected] of expectedByUser.entries()) {
      const currentValid = currentValidByUser.get(userId) || 0;
      const delta = toAmount(expected - currentValid);
      if (delta !== 0) correctionByUser.set(userId, delta);
    }

    const positiveCorrections = Array.from(correctionByUser.entries()).filter(([, delta]) => delta > 0);
    const negativeCorrections = Array.from(correctionByUser.entries()).filter(([, delta]) => delta < 0);

    console.log("Summary:");
    console.log(`- Invalid level IncomeLog rows: ${invalidIncomeLogs.length}`);
    console.log(`- Invalid level Transaction rows: ${invalidTransactions.length}`);
    console.log(`- Invalid level ReferralIncome rows: ${invalidReferralRows.length}`);
    console.log(`- Total invalid level amount to reset: ${totalInvalid}`);
    console.log(`- Users with positive correction: ${positiveCorrections.length}`);
    console.log(`- Users with negative correction: ${negativeCorrections.length}`);

    if (!apply) {
      console.log("Dry-run complete. Re-run with --apply to execute updates.");
      return;
    }

    const correctionStamp = new Date().toISOString();

    if (invalidIncomeLogs.length) {
      await IncomeLog.updateMany(
        { _id: { $in: invalidIncomeLogs.map((row) => row._id) } },
        {
          $set: {
            amount: 0,
            source: "Invalidated old principal-based level income",
            "metadata.correction": { invalidated: true, reason: "non_roi_level_income", at: correctionStamp },
          },
        }
      );
    }

    if (invalidTransactions.length) {
      await Transaction.updateMany(
        { _id: { $in: invalidTransactions.map((row) => row._id) } },
        {
          $set: {
            amount: 0,
            source: "Invalidated old principal-based level income",
            status: "failed",
            "metadata.correction": { invalidated: true, reason: "non_roi_level_income", at: correctionStamp },
          },
        }
      );
    }

    if (invalidReferralRows.length) {
      await ReferralIncome.updateMany(
        { _id: { $in: invalidReferralRows.map((row) => row._id) } },
        {
          $set: {
            amount: 0,
            "metadata.correction": { invalidated: true, reason: "non_roi_level_income", at: correctionStamp },
          },
        }
      );
    }

    for (const [userId, invalidAmount] of invalidByUser.entries()) {
      if (invalidAmount > 0) {
        await updateWalletForLevelDelta(userId, -invalidAmount);
      }
    }

    for (const [userId, delta] of correctionByUser.entries()) {
      if (delta === 0) continue;

      await updateWalletForLevelDelta(userId, delta);

      if (delta > 0) {
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toISOString().slice(11, 19);

        await Promise.all([
          IncomeLog.create({
            userId,
            incomeType: "level",
            type: "level",
            amount: delta,
            source: "Level income correction (ROI based recalculation)",
            metadata: { trigger: "correction_roi", correctedAt: correctionStamp },
            recordedAt: now,
            date,
            time,
          }),
          Transaction.create({
            userId,
            type: "level",
            amount: delta,
            network: "INTERNAL",
            source: "Level income correction (ROI based recalculation)",
            status: "completed",
            metadata: { trigger: "correction_roi", correctedAt: correctionStamp },
          }),
        ]);
      } else {
        await Transaction.create({
          userId,
          type: "wallet_transfer",
          amount: Math.abs(delta),
          network: "INTERNAL",
          source: "Level income over-credit correction debit",
          status: "completed",
          metadata: { trigger: "correction_roi_debit", correctedAt: correctionStamp },
        });
      }
    }

    console.log("Apply complete:");
    console.log(`- Invalidated IncomeLogs: ${invalidIncomeLogs.length}`);
    console.log(`- Invalidated Transactions: ${invalidTransactions.length}`);
    console.log(`- Invalidated ReferralIncome: ${invalidReferralRows.length}`);
    console.log(`- Wallet debits for invalid amounts: ${invalidByUser.size} users`);
    console.log(`- Corrections applied: ${correctionByUser.size} users`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Level income correction failed", error);
  process.exit(1);
});
