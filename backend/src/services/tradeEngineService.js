import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";
import { getTradingRoiRatePerSecond } from "./tradingSettingsService.js";

const TRADE_LIMIT_MULTIPLIER = Number(process.env.TRADE_LIMIT_MULTIPLIER || 2);
const TRADE_ENGINE_INTERVAL_MS = 1000;
const DEFAULT_DAILY_ROI_PERCENT = 1.2;
const DEFAULT_ROI_RATE_PER_SECOND = Number((DEFAULT_DAILY_ROI_PERCENT / 100 / 86400).toFixed(12));

let engineTimer = null;
let engineRunning = false;

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const settleTradeIncome = async (trade, now = new Date(), roiRateOverride = null) => {
  if (trade.status !== "active") {
    return { trade, settledAmount: 0, completed: false };
  }

  const lastSettledAt = new Date(trade.lastSettledAt || trade.startTime || trade.createdAt);
  const elapsedMs = now.getTime() - lastSettledAt.getTime();
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  if (elapsedSeconds <= 0) {
    return { trade, settledAmount: 0, completed: false };
  }

  const effectiveRoiRatePerSecond = Number.isFinite(roiRateOverride) ? roiRateOverride : await getTradingRoiRatePerSecond();
  const perSecondIncome = trade.amount * effectiveRoiRatePerSecond;
  const grossDelta = Number((perSecondIncome * elapsedSeconds).toFixed(6));
  const delta = Math.max(0, grossDelta);

  const nextLastSettledAt = new Date(lastSettledAt);
  nextLastSettledAt.setSeconds(nextLastSettledAt.getSeconds() + elapsedSeconds);
  trade.lastSettledAt = nextLastSettledAt;

  if (delta <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  const { creditedAmount } = await applyIncomeWithCap({
    userId: trade.userId,
    requestedAmount: delta,
    walletField: "tradingIncomeWallet",
  });

  if (creditedAmount <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  trade.totalIncome = Number((trade.totalIncome + creditedAmount).toFixed(6));
  await Promise.all([
    trade.save(),
    Transaction.create({
      userId: trade.userId,
      type: "trading",
      amount: creditedAmount,
      network: "INTERNAL",
      source: "trading engine",
      status: "completed",
      metadata: {
        tradeId: trade._id,
        roiRatePerSecond: effectiveRoiRatePerSecond,
        elapsedSeconds,
      },
    }),
    logIncomeEvent({
      userId: trade.userId,
      incomeType: "trading",
      amount: creditedAmount,
      source: "trading engine",
      metadata: {
        tradeId: trade._id,
        roiRatePerSecond: effectiveRoiRatePerSecond,
        elapsedSeconds,
      },
      recordedAt: now,
    }),
  ]);

  return { trade, settledAmount: creditedAmount, completed: false };
};

export const settleActiveTrades = async () => {
  if (engineRunning) {
    return { processed: 0, credited: 0 };
  }

  engineRunning = true;
  try {
    const activeTrades = await Trade.find({ status: "active" });
    const globalRoiRatePerSecond = await getTradingRoiRatePerSecond();
    let credited = 0;

    for (const trade of activeTrades) {
      const result = await settleTradeIncome(trade, new Date(), globalRoiRatePerSecond);
      if (result.settledAmount > 0) {
        credited += 1;
      }
    }

    return { processed: activeTrades.length, credited };
  } finally {
    engineRunning = false;
  }
};

export const startTradeEngine = () => {
  if (engineTimer) {
    return;
  }

  engineTimer = setInterval(() => {
    settleActiveTrades().catch((error) => {
      console.error("Trade engine cycle failed", error);
    });
  }, TRADE_ENGINE_INTERVAL_MS);
};

export const getTradeEngineConfig = () => ({
  roiRatePerSecond: DEFAULT_ROI_RATE_PER_SECOND,
  roiRatePerMinute: Number((DEFAULT_ROI_RATE_PER_SECOND * 60).toFixed(10)),
  dailyRoiPercent: DEFAULT_DAILY_ROI_PERCENT,
  tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
  intervalMs: TRADE_ENGINE_INTERVAL_MS,
});

export const getCurrentTradeEngineConfig = async () => {
  const roiRatePerSecond = await getTradingRoiRatePerSecond();
  const roiRatePerMinute = Number((roiRatePerSecond * 60).toFixed(10));
  return {
    roiRatePerSecond,
    roiRatePerMinute,
    dailyRoiPercent: Number((roiRatePerSecond * 86400 * 100).toFixed(6)),
    tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
    intervalMs: TRADE_ENGINE_INTERVAL_MS,
  };
};

export const getDefaultTradeLimit = (amount) => Number((amount * TRADE_LIMIT_MULTIPLIER).toFixed(2));
