#!/usr/bin/env node
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const backendRoot = path.resolve(scriptDir, "..");
const backendEnvPath = path.join(backendRoot, ".env");

dotenv.config({ path: backendEnvPath });

const hasConfirmDrop = process.argv.includes("--confirm-drop");

if (!hasConfirmDrop) {
  console.warn("[dropDatabase] Refusing to drop database without --confirm-drop.");
  console.warn("[dropDatabase] Usage: node scripts/dropDatabase.js --confirm-drop");
  process.exit(1);
}

const MONGO_URI = String(process.env.MONGO_URI || "").trim();

if (!MONGO_URI) {
  console.error("[dropDatabase] Missing MONGO_URI in environment.");
  process.exit(1);
}

const main = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const dbName = mongoose.connection?.db?.databaseName || "unknown";

    console.log(`[dropDatabase] Connected to database: ${dbName}`);
    await mongoose.connection.db.dropDatabase();
    console.log(`[dropDatabase] Database dropped successfully: ${dbName}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[dropDatabase] Failed to drop database:", error);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors during failure path
    }
    process.exit(1);
  }
};

main();
