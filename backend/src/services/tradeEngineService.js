import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";

const TRADE_LIMIT_MULTIPLIER = Number(process.env.TRADE_LIMIT_MULTIPLIER || 2);
const TRADE_ENGINE_INTERVAL_MS = 60 * 1000;
const DAILY_ROI_PERCENT = 1.2;
const FIXED_ROI_RATE_PER_MINUTE = Number((DAILY_ROI_PERCENT / 100 / 1440).toFixed(8));

let engineTimer = null;
let engineRunning = false;

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const settleTradeIncome = async (trade, now = new Date()) => {
  if (trade.status !== "active") {
    return { trade, settledAmount: 0, completed: false };
  }

  const lastSettledAt = new Date(trade.lastSettledAt || trade.startTime || trade.createdAt);
  const elapsedMs = now.getTime() - lastSettledAt.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes <= 0) {
    return { trade, settledAmount: 0, completed: false };
  }

  const effectiveRoiRatePerMinute = FIXED_ROI_RATE_PER_MINUTE;
  const perMinuteIncome = trade.amount * effectiveRoiRatePerMinute;
  const grossDelta = Number((perMinuteIncome * elapsedMinutes).toFixed(6));
  const delta = Math.max(0, grossDelta);

  const nextLastSettledAt = new Date(lastSettledAt);
  nextLastSettledAt.setMinutes(nextLastSettledAt.getMinutes() + elapsedMinutes);
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
        roiRatePerMinute: effectiveRoiRatePerMinute,
        elapsedMinutes,
      },
    }),
    logIncomeEvent({
      userId: trade.userId,
      incomeType: "trading",
      amount: creditedAmount,
      source: "trading engine",
      metadata: {
        tradeId: trade._id,
        roiRatePerMinute: effectiveRoiRatePerMinute,
        elapsedMinutes,
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
    let credited = 0;

    for (const trade of activeTrades) {
      const result = await settleTradeIncome(trade);
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
  roiRatePerMinute: FIXED_ROI_RATE_PER_MINUTE,
  dailyRoiPercent: DAILY_ROI_PERCENT,
  tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
  intervalMs: TRADE_ENGINE_INTERVAL_MS,
});

export const getDefaultTradeLimit = (amount) => Number((amount * TRADE_LIMIT_MULTIPLIER).toFixed(2));
