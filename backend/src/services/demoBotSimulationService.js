import DemoBotEntry from "../models/DemoBotEntry.js";

const ASSETS = ["BTC", "BNB", "ETH", "SOL", "XRP"];
const GENERATION_INTERVAL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_FEED_LIMIT = 60;
const MAX_FEED_LIMIT = 200;

let demoBotTimer = null;
let isGenerating = false;

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const buildSimulatedEntryPayload = () => {
  const isProfit = Math.random() >= 0.5;
  return {
    asset: ASSETS[randomInt(0, ASSETS.length - 1)],
    resultType: isProfit ? "profit" : "loss",
    amount: isProfit ? randomInt(3000, 10000) : randomInt(1000, 3000),
    isDemo: true,
    visibilityScope: "global",
    status: "live_demo",
  };
};

export const createNextGlobalDemoBotEntry = async () => {
  const payload = buildSimulatedEntryPayload();
  return DemoBotEntry.create(payload);
};

export const listGlobalDemoBotFeed = async ({ limit = DEFAULT_FEED_LIMIT } = {}) => {
  const safeLimit = Math.min(MAX_FEED_LIMIT, Math.max(1, Number(limit) || DEFAULT_FEED_LIMIT));
  return DemoBotEntry.find({ visibilityScope: "global", isDemo: true })
    .sort({ createdAt: -1 })
    .limit(safeLimit);
};

export const seedGlobalDemoBotFeedIfEmpty = async () => {
  const existing = await DemoBotEntry.countDocuments({ visibilityScope: "global", isDemo: true });
  if (existing > 0) return null;
  return createNextGlobalDemoBotEntry();
};

const generateOnInterval = async () => {
  if (isGenerating) return;
  isGenerating = true;
  try {
    await createNextGlobalDemoBotEntry();
  } catch (error) {
    console.error("[DemoBot] Failed to generate scheduled global demo entry", error);
  } finally {
    isGenerating = false;
  }
};

export const startDemoBotSimulationScheduler = ({ intervalMs = GENERATION_INTERVAL_MS } = {}) => {
  if (demoBotTimer) return;

  const effectiveInterval = Number(intervalMs) > 0 ? Number(intervalMs) : GENERATION_INTERVAL_MS;
  demoBotTimer = setInterval(() => {
    generateOnInterval().catch(() => {});
  }, effectiveInterval);

  console.log(`[DemoBot] Scheduler started. Interval=${effectiveInterval}ms`);
};

export const stopDemoBotSimulationScheduler = () => {
  if (!demoBotTimer) return;
  clearInterval(demoBotTimer);
  demoBotTimer = null;
  console.log("[DemoBot] Scheduler stopped.");
};
