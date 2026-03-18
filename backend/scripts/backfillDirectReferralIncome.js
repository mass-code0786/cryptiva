import mongoose from "mongoose";
import dotenv from "dotenv";

import { MONGO_URI } from "../src/config/env.js";
import { backfillDirectReferralIncome } from "../src/services/directReferralBackfillService.js";

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY_RUN = !APPLY;

const getArgValue = (name) => {
  const entry = args.find((arg) => arg.startsWith(`${name}=`));
  if (!entry) return "";
  return String(entry.split("=")[1] || "").trim();
};

const LIMIT_RAW = getArgValue("--limit");
const LIMIT = LIMIT_RAW ? Math.max(0, Number.parseInt(LIMIT_RAW, 10) || 0) : 0;
const FROM = getArgValue("--from") || null;
const TO = getArgValue("--to") || null;
const USER_ID = getArgValue("--userId") || null;
const SOURCES = getArgValue("--sources") || "all";

const main = async () => {
  console.log(APPLY ? "Running direct referral backfill in APPLY mode" : "Running direct referral backfill in DRY-RUN mode");
  console.log(`Options: sources=${SOURCES} limit=${LIMIT || "all"} from=${FROM || "-"} to=${TO || "-"} userId=${USER_ID || "-"}`);

  await mongoose.connect(MONGO_URI);
  try {
    const summary = await backfillDirectReferralIncome({
      dryRun: DRY_RUN,
      sources: SOURCES,
      limit: LIMIT,
      from: FROM,
      to: TO,
      userId: USER_ID,
    });

    console.log("Backfill summary:");
    console.log(`- dryRun: ${summary.dryRun}`);
    console.log(`- sources: ${summary.sources.join(",")}`);
    console.log(`- scanned: ${summary.scanned}`);
    console.log(`- creditedCount: ${summary.creditedCount}`);
    console.log(`- creditedAmount: ${summary.creditedAmount}`);

    const counterKeys = Object.keys(summary.counters).sort();
    for (const key of counterKeys) {
      console.log(`- ${key}: ${summary.counters[key]}`);
    }

    if (summary.dryRun) {
      console.log("Dry-run complete. Re-run with --apply to write credits.");
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Direct referral backfill failed", error);
  process.exit(1);
});
