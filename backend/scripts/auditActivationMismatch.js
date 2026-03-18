import fs from "node:fs/promises";
import mongoose from "mongoose";
import dotenv from "dotenv";

import { MONGO_URI } from "../src/config/env.js";

dotenv.config();

const MIN_ACTIVATION = 5;
const TRADE_ACTIVE_STATUSES = ["active", "completed"];

const hasFlag = (name) => process.argv.includes(name);
const getArgValue = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return String(process.argv[index + 1] || "").trim();
};

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const toCsvRow = (values) =>
  values
    .map((value) => {
      const raw = String(value ?? "");
      if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
      }
      return raw;
    })
    .join(",");

const main = async () => {
  const outputCsv = getArgValue("--csv");
  const showAll = hasFlag("--all");

  console.log("Running activation mismatch audit");
  console.log(`- Legacy wallet-based active threshold: >= ${MIN_ACTIVATION}`);
  console.log(`- New trade-based active threshold: >= ${MIN_ACTIVATION}`);
  if (outputCsv) {
    console.log(`- CSV output path: ${outputCsv}`);
  }

  await mongoose.connect(MONGO_URI);

  try {
    const usersCollection = mongoose.connection.collection("users");
    const walletsCollection = mongoose.connection.collection("wallets");
    const tradesCollection = mongoose.connection.collection("trades");

    const [users, wallets, tradeAgg] = await Promise.all([
      usersCollection
        .find(
          { isAdmin: { $ne: true } },
          {
            projection: {
              _id: 1,
              userId: 1,
              email: 1,
              name: 1,
              isBlocked: 1,
              createdAt: 1,
            },
          }
        )
        .toArray(),
      walletsCollection
        .find(
          {},
          {
            projection: {
              _id: 0,
              userId: 1,
              tradingWallet: 1,
              tradingBalance: 1,
              depositWallet: 1,
              withdrawalWallet: 1,
            },
          }
        )
        .toArray(),
      tradesCollection
        .aggregate([
          { $match: { status: { $in: TRADE_ACTIVE_STATUSES } } },
          { $group: { _id: "$userId", tradeInvestment: { $sum: "$amount" }, tradeCount: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const walletByUserId = new Map(wallets.map((wallet) => [String(wallet.userId), wallet]));
    const tradeByUserId = new Map(tradeAgg.map((row) => [String(row._id), row]));

    let legacyActiveCount = 0;
    let tradeActiveCount = 0;
    const mismatches = [];
    const allRows = [];

    for (const user of users) {
      const key = String(user._id);
      const wallet = walletByUserId.get(key) || {};
      const trade = tradeByUserId.get(key) || {};

      const legacyWalletInvestment = toAmount(Number(wallet.tradingWallet || wallet.tradingBalance || 0));
      const tradeInvestment = toAmount(Number(trade.tradeInvestment || 0));
      const legacyWalletActive = legacyWalletInvestment >= MIN_ACTIVATION;
      const tradeActive = tradeInvestment >= MIN_ACTIVATION;

      if (legacyWalletActive) legacyActiveCount += 1;
      if (tradeActive) tradeActiveCount += 1;

      const row = {
        mongoUserId: key,
        userId: String(user.userId || ""),
        email: String(user.email || ""),
        name: String(user.name || ""),
        blocked: Boolean(user.isBlocked),
        legacyWalletInvestment,
        tradeInvestment,
        legacyWalletActive,
        tradeActive,
        tradeCount: Number(trade.tradeCount || 0),
        depositWallet: toAmount(Number(wallet.depositWallet || 0)),
        withdrawalWallet: toAmount(Number(wallet.withdrawalWallet || 0)),
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : "",
      };

      allRows.push(row);
      if (legacyWalletActive !== tradeActive) {
        mismatches.push(row);
      }
    }

    console.log("Summary:");
    console.log(`- Total non-admin users: ${users.length}`);
    console.log(`- Legacy wallet-active users: ${legacyActiveCount}`);
    console.log(`- New trade-active users: ${tradeActiveCount}`);
    console.log(`- Mismatched users: ${mismatches.length}`);

    const rowsToPrint = showAll ? allRows : mismatches;
    if (!rowsToPrint.length) {
      console.log(showAll ? "No users found." : "No activation mismatches found.");
    } else {
      console.table(
        rowsToPrint.map((row) => ({
          userId: row.userId,
          email: row.email,
          blocked: row.blocked,
          legacyWalletActive: row.legacyWalletActive,
          tradeActive: row.tradeActive,
          legacyWalletInvestment: row.legacyWalletInvestment,
          tradeInvestment: row.tradeInvestment,
          tradeCount: row.tradeCount,
        }))
      );
    }

    if (outputCsv) {
      const header = [
        "mongoUserId",
        "userId",
        "email",
        "name",
        "blocked",
        "legacyWalletInvestment",
        "tradeInvestment",
        "legacyWalletActive",
        "tradeActive",
        "tradeCount",
        "depositWallet",
        "withdrawalWallet",
        "createdAt",
      ];
      const content = [toCsvRow(header), ...mismatches.map((row) => toCsvRow(header.map((key) => row[key])))].join("\n");
      await fs.writeFile(outputCsv, content, "utf8");
      console.log(`CSV written: ${outputCsv}`);
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Activation mismatch audit failed", error);
  process.exit(1);
});
