import mongoose from "mongoose";
import dotenv from "dotenv";

import { MONGO_URI } from "../src/config/env.js";

dotenv.config();

const main = async () => {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "Running referredBy migration in APPLY mode" : "Running referredBy migration in DRY mode");

  await mongoose.connect(MONGO_URI);

  try {
    const usersCollection = mongoose.connection.collection("users");

    const legacyRows = await usersCollection
      .find({ referredBy: { $type: "string", $ne: "" } }, { projection: { _id: 1, userId: 1, email: 1, referredBy: 1 } })
      .toArray();

    if (!legacyRows.length) {
      console.log("No legacy string referredBy values found.");
      return;
    }

    const sponsorKeys = new Set();
    for (const row of legacyRows) {
      const raw = String(row.referredBy || "").trim();
      if (!raw) continue;
      sponsorKeys.add(raw.toUpperCase());
      sponsorKeys.add(raw.toLowerCase());
    }

    const sponsors = await usersCollection
      .find(
        {
          $or: [{ userId: { $in: Array.from(sponsorKeys).map((entry) => entry.toUpperCase()) } }, { referralCode: { $in: Array.from(sponsorKeys).map((entry) => entry.toLowerCase()) } }],
        },
        { projection: { _id: 1, userId: 1, referralCode: 1 } }
      )
      .toArray();

    const sponsorByUserId = new Map();
    const sponsorByReferralCode = new Map();
    for (const sponsor of sponsors) {
      if (sponsor.userId) sponsorByUserId.set(String(sponsor.userId).toUpperCase(), sponsor);
      if (sponsor.referralCode) sponsorByReferralCode.set(String(sponsor.referralCode).toLowerCase(), sponsor);
    }

    const updates = [];
    const unresolved = [];

    for (const row of legacyRows) {
      const raw = String(row.referredBy || "").trim();
      if (!raw) {
        updates.push({
          filter: { _id: row._id },
          update: { $set: { referredBy: null, referredByUserId: null } },
        });
        continue;
      }

      const sponsor = sponsorByUserId.get(raw.toUpperCase()) || sponsorByReferralCode.get(raw.toLowerCase());
      if (!sponsor) {
        unresolved.push({ userId: row.userId || row.email || String(row._id), referredBy: raw });
        updates.push({
          filter: { _id: row._id },
          update: { $set: { referredBy: null, referredByUserId: null } },
        });
        continue;
      }

      updates.push({
        filter: { _id: row._id },
        update: { $set: { referredBy: sponsor._id, referredByUserId: sponsor.userId || null } },
      });
    }

    console.log(`Found ${legacyRows.length} legacy users`);
    console.log(`Prepared ${updates.length} updates`);
    console.log(`Unresolved sponsors: ${unresolved.length}`);

    if (unresolved.length) {
      console.log("Unresolved sample:", unresolved.slice(0, 20));
    }

    if (!apply) {
      console.log("Dry run complete. Re-run with --apply to write changes.");
      return;
    }

    for (const op of updates) {
      await usersCollection.updateOne(op.filter, op.update);
    }

    console.log(`Applied ${updates.length} updates.`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("referredBy migration failed", error);
  process.exit(1);
});
