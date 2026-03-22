#!/usr/bin/env node
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import path from "node:path";

import User from "../src/models/User.js";
import Wallet from "../src/models/Wallet.js";
import Trade from "../src/models/Trade.js";
import Transaction from "../src/models/Transaction.js";
import IncomeLog from "../src/models/IncomeLog.js";
import ReferralIncome from "../src/models/ReferralIncome.js";
import SalaryLog from "../src/models/SalaryLog.js";
import SalaryPayout from "../src/models/SalaryPayout.js";
import PackagePurchase from "../src/models/PackagePurchase.js";
import Deposit from "../src/models/Deposit.js";
import Withdrawal from "../src/models/Withdrawal.js";
import Setting from "../src/models/Setting.js";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const backendRoot = path.resolve(scriptDir, "..");
const backendEnvPath = path.join(backendRoot, ".env");

const dotenvResult = dotenv.config({ path: backendEnvPath });
console.log(`[resetTestingState] dotenv path tried: ${backendEnvPath}`);
if (dotenvResult.error) {
  console.warn(`[resetTestingState] dotenv load warning: ${dotenvResult.error.message}`);
}

const mongoUriFromEnvFile = String(dotenvResult.parsed?.MONGO_URI || "").trim();
const MONGO_URI = String(process.env.MONGO_URI || "").trim();

if (MONGO_URI) {
  const source = mongoUriFromEnvFile ? "backend/.env" : "process env";
  console.log(`[resetTestingState] MONGO_URI loaded successfully (${source}).`);
} else {
  console.error("[resetTestingState] Missing MONGO_URI after dotenv load.");
  console.error(`[resetTestingState] Checked backend env file: ${backendEnvPath}`);
  process.exit(1);
}

const hasConfirm = process.argv.includes("--confirm-reset");

const COLLECTIONS = {
  users: User,
  wallets: Wallet,
  trades: Trade,
  transactions: Transaction,
  incomeLogs: IncomeLog,
  referralIncome: ReferralIncome,
  salaryLogs: SalaryLog,
  salaryPayouts: SalaryPayout,
  packagePurchases: PackagePurchase,
  deposits: Deposit,
  withdrawals: Withdrawal,
  settings: Setting,
};

const getSummary = async () => {
  const [userCount, adminCount, walletCount, tradeCount, txnCount, incomeLogCount, referralIncomeCount, salaryLogCount, salaryPayoutCount, packagePurchaseCount, depositCount, withdrawalCount, idempotencySettingsCount, incomeCapResetSettingCount, incomeCapApplyLockCount] =
    await Promise.all([
      COLLECTIONS.users.countDocuments({}),
      COLLECTIONS.users.countDocuments({ isAdmin: true }),
      COLLECTIONS.wallets.countDocuments({}),
      COLLECTIONS.trades.countDocuments({}),
      COLLECTIONS.transactions.countDocuments({}),
      COLLECTIONS.incomeLogs.countDocuments({}),
      COLLECTIONS.referralIncome.countDocuments({}),
      COLLECTIONS.salaryLogs.countDocuments({}),
      COLLECTIONS.salaryPayouts.countDocuments({}),
      COLLECTIONS.packagePurchases.countDocuments({}),
      COLLECTIONS.deposits.countDocuments({}),
      COLLECTIONS.withdrawals.countDocuments({}),
      COLLECTIONS.settings.countDocuments({ key: { $regex: /^idempotency_v1:/ } }),
      COLLECTIONS.settings.countDocuments({ key: { $regex: /^income_cap_reset_v2:/ } }),
      COLLECTIONS.settings.countDocuments({ key: { $regex: /^income_cap_apply_v1:/ } }),
    ]);

  return {
    userCount,
    adminCount,
    walletCount,
    tradeCount,
    txnCount,
    incomeLogCount,
    referralIncomeCount,
    salaryLogCount,
    salaryPayoutCount,
    packagePurchaseCount,
    depositCount,
    withdrawalCount,
    idempotencySettingsCount,
    incomeCapResetSettingCount,
    incomeCapApplyLockCount,
  };
};

const printSummary = (label, summary) => {
  console.log(`\n=== ${label} ===`);
  console.log(`Users (kept): ${summary.userCount}`);
  console.log(`Admin users (kept): ${summary.adminCount}`);
  console.log(`Wallet docs: ${summary.walletCount}`);
  console.log(`Trades: ${summary.tradeCount}`);
  console.log(`Transactions: ${summary.txnCount}`);
  console.log(`Income logs: ${summary.incomeLogCount}`);
  console.log(`Referral income logs: ${summary.referralIncomeCount}`);
  console.log(`Salary logs: ${summary.salaryLogCount}`);
  console.log(`Salary payouts: ${summary.salaryPayoutCount}`);
  console.log(`Package purchases: ${summary.packagePurchaseCount}`);
  console.log(`Deposits: ${summary.depositCount}`);
  console.log(`Withdrawals: ${summary.withdrawalCount}`);
  console.log(`Settings (idempotency_v1:*): ${summary.idempotencySettingsCount}`);
  console.log(`Settings (income_cap_reset_v2:*): ${summary.incomeCapResetSettingCount}`);
  console.log(`Settings (income_cap_apply_v1:*): ${summary.incomeCapApplyLockCount}`);
};

const applyReset = async () => {
  const now = new Date();

  const userReset = await COLLECTIONS.users.updateMany(
    { isAdmin: { $ne: true } },
    {
      $set: {
        isActive: false,
        packageActive: false,
        packageStatus: "inactive",
        mlmEligible: false,
        activatedAt: null,
        lastActivationSource: "",
        salaryRank: 0,
        salaryRankName: "",
        mainLegBusiness: 0,
        otherLegBusiness: 0,
        totalTeamBusiness: 0,
        updatedAt: now,
      },
    }
  );

  const walletReset = await COLLECTIONS.wallets.updateMany(
    {},
    {
      $set: {
        depositWallet: 0,
        withdrawalWallet: 0,
        balance: 0,
        tradingBalance: 0,
        tradingWallet: 0,
        tradingIncomeWallet: 0,
        referralIncomeWallet: 0,
        levelIncomeWallet: 0,
        salaryIncomeWallet: 0,
        depositTotal: 0,
        withdrawTotal: 0,
        p2pTotal: 0,
        updatedAt: now,
      },
    }
  );

  const [tradesDeleted, transactionsDeleted, incomeLogsDeleted, referralIncomeDeleted, salaryLogsDeleted, salaryPayoutsDeleted, packagePurchasesDeleted, depositsDeleted, withdrawalsDeleted, idempotencySettingsDeleted, incomeCapResetSettingsDeleted, incomeCapApplyLocksDeleted] =
    await Promise.all([
      COLLECTIONS.trades.deleteMany({}),
      COLLECTIONS.transactions.deleteMany({}),
      COLLECTIONS.incomeLogs.deleteMany({}),
      COLLECTIONS.referralIncome.deleteMany({}),
      COLLECTIONS.salaryLogs.deleteMany({}),
      COLLECTIONS.salaryPayouts.deleteMany({}),
      COLLECTIONS.packagePurchases.deleteMany({}),
      COLLECTIONS.deposits.deleteMany({}),
      COLLECTIONS.withdrawals.deleteMany({}),
      COLLECTIONS.settings.deleteMany({ key: { $regex: /^idempotency_v1:/ } }),
      COLLECTIONS.settings.deleteMany({ key: { $regex: /^income_cap_reset_v2:/ } }),
      COLLECTIONS.settings.deleteMany({ key: { $regex: /^income_cap_apply_v1:/ } }),
    ]);

  return {
    usersUpdated: Number(userReset.modifiedCount || 0),
    walletsUpdated: Number(walletReset.modifiedCount || 0),
    tradesDeleted: Number(tradesDeleted.deletedCount || 0),
    transactionsDeleted: Number(transactionsDeleted.deletedCount || 0),
    incomeLogsDeleted: Number(incomeLogsDeleted.deletedCount || 0),
    referralIncomeDeleted: Number(referralIncomeDeleted.deletedCount || 0),
    salaryLogsDeleted: Number(salaryLogsDeleted.deletedCount || 0),
    salaryPayoutsDeleted: Number(salaryPayoutsDeleted.deletedCount || 0),
    packagePurchasesDeleted: Number(packagePurchasesDeleted.deletedCount || 0),
    depositsDeleted: Number(depositsDeleted.deletedCount || 0),
    withdrawalsDeleted: Number(withdrawalsDeleted.deletedCount || 0),
    idempotencySettingsDeleted: Number(idempotencySettingsDeleted.deletedCount || 0),
    incomeCapResetSettingsDeleted: Number(incomeCapResetSettingsDeleted.deletedCount || 0),
    incomeCapApplyLocksDeleted: Number(incomeCapApplyLocksDeleted.deletedCount || 0),
  };
};

const main = async () => {
  await mongoose.connect(MONGO_URI);
  try {
    const before = await getSummary();
    printSummary("RESET PREVIEW (BEFORE)", before);

    if (!hasConfirm) {
      console.log("\nNo changes applied.");
      console.log("Run again with --confirm-reset to apply.");
      console.log("Example: node backend/scripts/resetTestingState.js --confirm-reset");
      return;
    }

    console.log("\nApplying testing reset...");
    const result = await applyReset();
    console.log("\n=== RESET APPLIED ===");
    Object.entries(result).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });

    const after = await getSummary();
    printSummary("RESET RESULT (AFTER)", after);

    console.log("\nUsers/login credentials/referral links were preserved.");
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Reset script failed:", error);
  process.exit(1);
});
