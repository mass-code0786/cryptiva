#!/usr/bin/env node
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import path from "node:path";

import User from "../src/models/User.js";
import Wallet from "../src/models/Wallet.js";
import WalletBinding from "../src/models/WalletBinding.js";
import Trade from "../src/models/Trade.js";
import Deposit from "../src/models/Deposit.js";
import Withdrawal from "../src/models/Withdrawal.js";
import Transaction from "../src/models/Transaction.js";
import ReferralIncome from "../src/models/ReferralIncome.js";
import IncomeLog from "../src/models/IncomeLog.js";
import SalaryLog from "../src/models/SalaryLog.js";
import SalaryPayout from "../src/models/SalaryPayout.js";
import Notification from "../src/models/Notification.js";
import NotificationBroadcast from "../src/models/NotificationBroadcast.js";
import SupportQuery from "../src/models/SupportQuery.js";
import ActivityLog from "../src/models/ActivityLog.js";
import PackagePurchase from "../src/models/PackagePurchase.js";
import Setting from "../src/models/Setting.js";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const backendRoot = path.resolve(scriptDir, "..");
const backendEnvPath = path.join(backendRoot, ".env");

dotenv.config({ path: backendEnvPath });

const hasConfirmReset = process.argv.includes("--confirm-reset-non-admin");
if (!hasConfirmReset) {
  console.warn("[resetPreserveAdmins] Refusing to proceed without --confirm-reset-non-admin");
  console.warn("[resetPreserveAdmins] Usage: node scripts/resetPreserveAdmins.js --confirm-reset-non-admin");
  process.exit(1);
}

const MONGO_URI = String(process.env.MONGO_URI || "").trim();
if (!MONGO_URI) {
  console.error("[resetPreserveAdmins] Missing MONGO_URI in environment.");
  process.exit(1);
}

const PRESERVED_ROLE_VALUES = ["admin", "super_admin"];
const preservedUsersQuery = {
  $or: [{ isAdmin: true }, { role: { $in: PRESERVED_ROLE_VALUES } }],
};

const toIdString = (value) => String(value);

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const summary = {
    preservedUsers: 0,
    removedUsers: 0,
    walletsDeleted: 0,
    walletBindingsDeleted: 0,
    tradesDeleted: 0,
    depositsDeleted: 0,
    withdrawalsDeleted: 0,
    transactionsDeleted: 0,
    referralIncomesDeleted: 0,
    incomeLogsDeleted: 0,
    salaryLogsDeleted: 0,
    salaryPayoutsDeleted: 0,
    notificationsDeleted: 0,
    supportQueriesDeleted: 0,
    activityLogsDeleted: 0,
    packagePurchasesDeleted: 0,
    idempotencySettingsDeleted: 0,
    incomeCapResetSettingsDeleted: 0,
    incomeCapApplyLockSettingsDeleted: 0,
    tradeEngineLockSettingsDeleted: 0,
    preservedReferredByCleared: 0,
    preservedReferralsPulled: 0,
    broadcastsSelectedUserIdsPruned: 0,
    broadcastCountersZeroed: 0,
    broadcastCountersRecomputed: 0,
  };

  try {
    const [preservedUsers, removableUsers] = await Promise.all([
      User.find(preservedUsersQuery, { _id: 1, userId: 1, isAdmin: 1, role: 1 }).lean(),
      User.find({ $nor: [{ isAdmin: true }, { role: { $in: PRESERVED_ROLE_VALUES } }] }, { _id: 1, userId: 1 }).lean(),
    ]);

    const preservedUserIds = preservedUsers.map((u) => u._id);
    const removableUserIds = removableUsers.map((u) => u._id);
    const removableUserIdCodes = removableUsers.map((u) => String(u.userId || "").trim()).filter(Boolean);

    summary.preservedUsers = preservedUsers.length;

    console.log(`[resetPreserveAdmins] Connected DB: ${mongoose.connection?.db?.databaseName || "unknown"}`);
    console.log(`[resetPreserveAdmins] Preserved users (admin/super_admin): ${preservedUsers.length}`);
    console.log(`[resetPreserveAdmins] Users targeted for deletion: ${removableUsers.length}`);

    const [
      walletsDeleted,
      walletBindingsDeleted,
      tradesDeleted,
      depositsDeleted,
      withdrawalsDeleted,
      transactionsDeleted,
      referralIncomesDeleted,
      incomeLogsDeleted,
      salaryLogsDeleted,
      salaryPayoutsDeleted,
      notificationsDeleted,
      supportQueriesDeleted,
      activityLogsDeleted,
      packagePurchasesDeleted,
      usersDeleted,
      idempotencySettingsDeleted,
      incomeCapResetSettingsDeleted,
      incomeCapApplyLockSettingsDeleted,
      tradeEngineLockSettingsDeleted,
    ] = await Promise.all([
      Wallet.deleteMany({ userId: { $in: removableUserIds } }),
      WalletBinding.deleteMany({ userId: { $in: removableUserIds } }),
      Trade.deleteMany({ userId: { $in: removableUserIds } }),
      Deposit.deleteMany({ userId: { $in: removableUserIds } }),
      Withdrawal.deleteMany({ userId: { $in: removableUserIds } }),
      Transaction.deleteMany({ userId: { $in: removableUserIds } }),
      ReferralIncome.deleteMany({ $or: [{ userId: { $in: removableUserIds } }, { sourceUserId: { $in: removableUserIds } }] }),
      IncomeLog.deleteMany({ userId: { $in: removableUserIds } }),
      SalaryLog.deleteMany({ userId: { $in: removableUserIds } }),
      SalaryPayout.deleteMany({ userId: { $in: removableUserIds } }),
      Notification.deleteMany({ userId: { $in: removableUserIds } }),
      SupportQuery.deleteMany({ userId: { $in: removableUserIds } }),
      ActivityLog.deleteMany({
        $or: [{ adminId: { $in: removableUserIds } }, { userId: { $in: removableUserIds } }, { targetUserId: { $in: removableUserIds } }],
      }),
      PackagePurchase.deleteMany({ userId: { $in: removableUserIds } }),
      User.deleteMany({ _id: { $in: removableUserIds }, $nor: [{ isAdmin: true }, { role: { $in: PRESERVED_ROLE_VALUES } }] }),
      Setting.deleteMany({ key: { $regex: /^idempotency_v1:/ } }),
      Setting.deleteMany({ key: { $regex: /^income_cap_reset_v2:/ } }),
      Setting.deleteMany({ key: { $regex: /^income_cap_apply_v1:/ } }),
      Setting.deleteMany({ key: { $regex: /^trade_engine:/ } }),
    ]);

    summary.walletsDeleted = Number(walletsDeleted.deletedCount || 0);
    summary.walletBindingsDeleted = Number(walletBindingsDeleted.deletedCount || 0);
    summary.tradesDeleted = Number(tradesDeleted.deletedCount || 0);
    summary.depositsDeleted = Number(depositsDeleted.deletedCount || 0);
    summary.withdrawalsDeleted = Number(withdrawalsDeleted.deletedCount || 0);
    summary.transactionsDeleted = Number(transactionsDeleted.deletedCount || 0);
    summary.referralIncomesDeleted = Number(referralIncomesDeleted.deletedCount || 0);
    summary.incomeLogsDeleted = Number(incomeLogsDeleted.deletedCount || 0);
    summary.salaryLogsDeleted = Number(salaryLogsDeleted.deletedCount || 0);
    summary.salaryPayoutsDeleted = Number(salaryPayoutsDeleted.deletedCount || 0);
    summary.notificationsDeleted = Number(notificationsDeleted.deletedCount || 0);
    summary.supportQueriesDeleted = Number(supportQueriesDeleted.deletedCount || 0);
    summary.activityLogsDeleted = Number(activityLogsDeleted.deletedCount || 0);
    summary.packagePurchasesDeleted = Number(packagePurchasesDeleted.deletedCount || 0);
    summary.removedUsers = Number(usersDeleted.deletedCount || 0);
    summary.idempotencySettingsDeleted = Number(idempotencySettingsDeleted.deletedCount || 0);
    summary.incomeCapResetSettingsDeleted = Number(incomeCapResetSettingsDeleted.deletedCount || 0);
    summary.incomeCapApplyLockSettingsDeleted = Number(incomeCapApplyLockSettingsDeleted.deletedCount || 0);
    summary.tradeEngineLockSettingsDeleted = Number(tradeEngineLockSettingsDeleted.deletedCount || 0);

    const [preservedReferredByCleared, preservedReferralsPulled, broadcastsSelectedUserIdsPruned] = await Promise.all([
      User.updateMany(
        {
          ...preservedUsersQuery,
          $or: [{ referredBy: { $in: removableUserIds } }, { referredByUserId: { $in: removableUserIdCodes } }],
        },
        {
          $set: { referredBy: null, referredByUserId: null },
        }
      ),
      User.updateMany(
        preservedUsersQuery,
        {
          $pull: { referrals: { $in: removableUserIds } },
        }
      ),
      NotificationBroadcast.updateMany(
        { selectedUserIds: { $in: removableUserIds } },
        { $pull: { selectedUserIds: { $in: removableUserIds } } }
      ),
    ]);

    summary.preservedReferredByCleared = Number(preservedReferredByCleared.modifiedCount || 0);
    summary.preservedReferralsPulled = Number(preservedReferralsPulled.modifiedCount || 0);
    summary.broadcastsSelectedUserIdsPruned = Number(broadcastsSelectedUserIdsPruned.modifiedCount || 0);

    const broadcastZero = await NotificationBroadcast.updateMany({}, { $set: { recipientCount: 0, deliveredCount: 0 } });
    summary.broadcastCountersZeroed = Number(broadcastZero.modifiedCount || 0);

    const broadcastCounts = await Notification.aggregate([
      {
        $group: {
          _id: "$broadcastId",
          count: { $sum: 1 },
        },
      },
    ]);

    if (broadcastCounts.length > 0) {
      const bulkResult = await NotificationBroadcast.bulkWrite(
        broadcastCounts.map((row) => ({
          updateOne: {
            filter: { _id: row._id },
            update: { $set: { recipientCount: row.count, deliveredCount: row.count } },
          },
        }))
      );
      summary.broadcastCountersRecomputed = Number(bulkResult.modifiedCount || 0);
    }

    const remainingUsers = await User.countDocuments({});
    const remainingPreservedUsers = await User.countDocuments(preservedUsersQuery);
    const remainingRemovedScopeUsers = await User.countDocuments({
      $nor: [{ isAdmin: true }, { role: { $in: PRESERVED_ROLE_VALUES } }],
    });

    console.log("\n=== RESET SUMMARY (PRESERVE ADMINS) ===");
    Object.entries(summary).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    console.log(`remainingUsers: ${remainingUsers}`);
    console.log(`remainingPreservedUsers: ${remainingPreservedUsers}`);
    console.log(`remainingUsersOutsidePreservedRoles: ${remainingRemovedScopeUsers}`);
    console.log(`[resetPreserveAdmins] Preserved user IDs: ${preservedUserIds.map(toIdString).join(", ") || "none"}`);
  } finally {
    await mongoose.disconnect();
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[resetPreserveAdmins] Failed:", error);
    process.exit(1);
  });
