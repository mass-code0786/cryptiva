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

const CONFIRM_FLAG = "--confirm-reset-non-admin";
const PRESERVED_ROLES = ["admin", "super_admin"];
const RUNTIME_KEY_PATTERNS = [/^idempotency_v1:/, /^income_cap_reset_v2:/, /^income_cap_apply_v1:/, /^trade_engine:/];

const hasConfirmReset = process.argv.includes(CONFIRM_FLAG);
if (!hasConfirmReset) {
  console.warn(`[resetPreserveAdmins] Refusing to run without ${CONFIRM_FLAG}`);
  console.warn(`[resetPreserveAdmins] Usage: node scripts/resetPreserveAdmins.js ${CONFIRM_FLAG}`);
  process.exit(0);
}

const MONGO_URI = String(process.env.MONGO_URI || "").trim();
if (!MONGO_URI) {
  console.error("[resetPreserveAdmins] Missing MONGO_URI in environment.");
  process.exit(1);
}

const preservedUsersQuery = { role: { $in: PRESERVED_ROLES } };
const removableUsersQuery = { role: { $nin: PRESERVED_ROLES } };
const runtimeSettingsQuery = { $or: RUNTIME_KEY_PATTERNS.map((pattern) => ({ key: { $regex: pattern } })) };

const modelMap = {
  users: User,
  wallets: Wallet,
  walletbindings: WalletBinding,
  trades: Trade,
  deposits: Deposit,
  withdrawals: Withdrawal,
  transactions: Transaction,
  referralincomes: ReferralIncome,
  incomelogs: IncomeLog,
  salarylogs: SalaryLog,
  salarypayouts: SalaryPayout,
  notifications: Notification,
  supportqueries: SupportQuery,
  activitylogs: ActivityLog,
  packagepurchases: PackagePurchase,
  settings: Setting,
  notificationbroadcasts: NotificationBroadcast,
};

const main = async () => {
  await mongoose.connect(MONGO_URI);

  try {
    const dbName = mongoose.connection?.db?.databaseName || "unknown";
    const existingCollections = new Set(
      (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => String(c?.name || "").toLowerCase())
    );

    const hasCollection = (key) => {
      const model = modelMap[key];
      const collectionName = String(model?.collection?.name || "").toLowerCase();
      return Boolean(collectionName && existingCollections.has(collectionName));
    };

    const safeCount = async (key, query = {}) => {
      if (!hasCollection(key)) return 0;
      return Number((await modelMap[key].countDocuments(query)) || 0);
    };

    const safeDelete = async (key, query = {}) => {
      if (!hasCollection(key)) return 0;
      const result = await modelMap[key].deleteMany(query);
      return Number(result?.deletedCount || 0);
    };

    const [preservedUsers, removableUsers] = await Promise.all([
      User.find(preservedUsersQuery, { _id: 1, userId: 1, role: 1 }).lean(),
      User.find(removableUsersQuery, { _id: 1, userId: 1, role: 1 }).lean(),
    ]);

    const preservedUserIds = preservedUsers.map((u) => u._id);
    const removableUserIds = removableUsers.map((u) => u._id);
    const removableUserCodes = removableUsers.map((u) => String(u.userId || "").trim()).filter(Boolean);

    const before = {
      database: dbName,
      users: {
        total: await safeCount("users"),
        preserved: await safeCount("users", preservedUsersQuery),
        removable: await safeCount("users", removableUsersQuery),
      },
      collections: {
        wallets: await safeCount("wallets"),
        walletbindings: await safeCount("walletbindings"),
        trades: await safeCount("trades"),
        deposits: await safeCount("deposits"),
        withdrawals: await safeCount("withdrawals"),
        transactions: await safeCount("transactions"),
        referralincomes: await safeCount("referralincomes"),
        incomelogs: await safeCount("incomelogs"),
        salarylogs: await safeCount("salarylogs"),
        salarypayouts: await safeCount("salarypayouts"),
        notifications: await safeCount("notifications"),
        supportqueries: await safeCount("supportqueries"),
        activitylogs: await safeCount("activitylogs"),
        packagepurchases: await safeCount("packagepurchases"),
        runtimeLockSettings: await safeCount("settings", runtimeSettingsQuery),
      },
    };

    const deleted = {
      wallets: await safeDelete("wallets", { userId: { $in: removableUserIds } }),
      walletbindings: await safeDelete("walletbindings", { userId: { $in: removableUserIds } }),
      trades: await safeDelete("trades", { userId: { $in: removableUserIds } }),
      deposits: await safeDelete("deposits", { userId: { $in: removableUserIds } }),
      withdrawals: await safeDelete("withdrawals", { userId: { $in: removableUserIds } }),
      transactions: await safeDelete("transactions", { userId: { $in: removableUserIds } }),
      referralincomes: await safeDelete("referralincomes", {
        $or: [
          { userId: { $in: removableUserIds } },
          { sourceUserId: { $in: removableUserIds } },
          { sponsorId: { $in: removableUserIds } },
        ],
      }),
      incomelogs: await safeDelete("incomelogs", { userId: { $in: removableUserIds } }),
      salarylogs: await safeDelete("salarylogs", { userId: { $in: removableUserIds } }),
      salarypayouts: await safeDelete("salarypayouts", { userId: { $in: removableUserIds } }),
      notifications: await safeDelete("notifications", { userId: { $in: removableUserIds } }),
      supportqueries: await safeDelete("supportqueries", { userId: { $in: removableUserIds } }),
      activitylogs: await safeDelete("activitylogs", {
        $or: [{ adminId: { $in: removableUserIds } }, { userId: { $in: removableUserIds } }, { targetUserId: { $in: removableUserIds } }],
      }),
      packagepurchases: await safeDelete("packagepurchases", { userId: { $in: removableUserIds } }),
      users: await safeDelete("users", { _id: { $in: removableUserIds } }),
      runtimeLockSettings: await safeDelete("settings", runtimeSettingsQuery),
    };

    const danglingCleanup = {
      preservedReferredByCleared: 0,
      preservedReferralsPulled: 0,
      broadcastsSelectedUserIdsPruned: 0,
      broadcastCountersReset: 0,
      broadcastCountersRecomputed: 0,
    };

    if (hasCollection("users")) {
      const clearReferredByResult = await User.updateMany(
        {
          ...preservedUsersQuery,
          $or: [{ referredBy: { $in: removableUserIds } }, { referredByUserId: { $in: removableUserCodes } }],
        },
        { $set: { referredBy: null, referredByUserId: null } }
      );
      danglingCleanup.preservedReferredByCleared = Number(clearReferredByResult?.modifiedCount || 0);

      const pullReferralsResult = await User.updateMany(preservedUsersQuery, { $pull: { referrals: { $in: removableUserIds } } });
      danglingCleanup.preservedReferralsPulled = Number(pullReferralsResult?.modifiedCount || 0);
    }

    if (hasCollection("notificationbroadcasts")) {
      const pruneBroadcastUsersResult = await NotificationBroadcast.updateMany(
        { selectedUserIds: { $in: removableUserIds } },
        { $pull: { selectedUserIds: { $in: removableUserIds } } }
      );
      danglingCleanup.broadcastsSelectedUserIdsPruned = Number(pruneBroadcastUsersResult?.modifiedCount || 0);

      const resetCountersResult = await NotificationBroadcast.updateMany({}, { $set: { recipientCount: 0, deliveredCount: 0 } });
      danglingCleanup.broadcastCountersReset = Number(resetCountersResult?.modifiedCount || 0);

      if (hasCollection("notifications")) {
        const grouped = await Notification.aggregate([{ $group: { _id: "$broadcastId", count: { $sum: 1 } } }]);
        if (grouped.length > 0) {
          const bulk = await NotificationBroadcast.bulkWrite(
            grouped.map((row) => ({
              updateOne: {
                filter: { _id: row._id },
                update: { $set: { recipientCount: Number(row.count || 0), deliveredCount: Number(row.count || 0) } },
              },
            }))
          );
          danglingCleanup.broadcastCountersRecomputed = Number(bulk?.modifiedCount || 0);
        }
      }
    }

    const after = {
      users: {
        total: await safeCount("users"),
        preserved: await safeCount("users", preservedUsersQuery),
        removable: await safeCount("users", removableUsersQuery),
      },
      collections: {
        wallets: await safeCount("wallets"),
        walletbindings: await safeCount("walletbindings"),
        trades: await safeCount("trades"),
        deposits: await safeCount("deposits"),
        withdrawals: await safeCount("withdrawals"),
        transactions: await safeCount("transactions"),
        referralincomes: await safeCount("referralincomes"),
        incomelogs: await safeCount("incomelogs"),
        salarylogs: await safeCount("salarylogs"),
        salarypayouts: await safeCount("salarypayouts"),
        notifications: await safeCount("notifications"),
        supportqueries: await safeCount("supportqueries"),
        activitylogs: await safeCount("activitylogs"),
        packagepurchases: await safeCount("packagepurchases"),
        runtimeLockSettings: await safeCount("settings", runtimeSettingsQuery),
      },
      remainingUsers: {
        total: await safeCount("users"),
        preservedRoles: await safeCount("users", preservedUsersQuery),
      },
    };

    console.log(`\n[resetPreserveAdmins] Connected database: ${dbName}`);
    console.log("[resetPreserveAdmins] Preserved roles:", PRESERVED_ROLES.join(", "));
    console.log("[resetPreserveAdmins] Preserved user IDs:", preservedUserIds.map(String).join(", ") || "none");

    console.log("\n=== BEFORE SUMMARY ===");
    console.log(JSON.stringify(before, null, 2));

    console.log("\n=== DELETED COUNTS ===");
    console.log(JSON.stringify(deleted, null, 2));

    console.log("\n=== DANGLING REFERENCE CLEANUP ===");
    console.log(JSON.stringify(danglingCleanup, null, 2));

    console.log("\n=== AFTER SUMMARY ===");
    console.log(JSON.stringify(after, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[resetPreserveAdmins] Failed:", error?.message || error);
    process.exit(1);
  });
