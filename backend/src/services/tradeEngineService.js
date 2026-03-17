import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { getTradingRoiRatePerMinute } from "./tradingSettingsService.js";

const TRADE_LIMIT_MULTIPLIER = Number(process.env.TRADE_LIMIT_MULTIPLIER || 2);
const TRADE_ENGINE_INTERVAL_MS = 60 * 1000;
const DEFAULT_DAILY_ROI_PERCENT = 1.2;
const DEFAULT_ROI_RATE_PER_MINUTE = Number((DEFAULT_DAILY_ROI_PERCENT / 100 / 1440).toFixed(8));

let engineTimer = null;
let engineRunning = false;

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const settleTradeIncome = async (trade, now = new Date(), roiRatePerMinuteOverride = null) => {
  if (trade.status !== "active") {
    return { trade, settledAmount: 0, completed: false };
  }

  const lastSettledAt = new Date(trade.lastSettledAt || trade.startTime || trade.createdAt);
  const elapsedMs = now.getTime() - lastSettledAt.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes <= 0) {
    return { trade, settledAmount: 0, completed: false };
  }

  const nextLastSettledAt = new Date(lastSettledAt);
  nextLastSettledAt.setMinutes(nextLastSettledAt.getMinutes() + elapsedMinutes);
  trade.lastSettledAt = nextLastSettledAt;

  const tradeAmount = Number(trade.amount || 0);
  if (tradeAmount <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  const wallet = await ensureWallet(trade.userId);
  const tradingPrincipal = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  if (tradingPrincipal <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  const effectiveRoiRatePerMinute = Number.isFinite(trade.manualRoiRate)
    ? Number(trade.manualRoiRate)
    : Number.isFinite(roiRatePerMinuteOverride)
      ? roiRatePerMinuteOverride
      : await getTradingRoiRatePerMinute();

  const perMinuteIncome = tradeAmount * effectiveRoiRatePerMinute;
  const grossDelta = Number((perMinuteIncome * elapsedMinutes).toFixed(6));
  const delta = Math.max(0, grossDelta);

  if (delta <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  const creditedAmount = delta;

  if (creditedAmount <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  wallet.tradingIncomeWallet = toAmount(wallet.tradingIncomeWallet) + creditedAmount;
  wallet.withdrawalWallet = toAmount(wallet.withdrawalWallet) + creditedAmount;
  wallet.balance = toAmount(wallet.depositWallet) + toAmount(wallet.withdrawalWallet);
  trade.totalIncome = Number((trade.totalIncome + creditedAmount).toFixed(6));

  await Promise.all([
    wallet.save(),
    trade.save(),
    Transaction.create({
      userId: trade.userId,
      type: "trading",
      amount: creditedAmount,
      network: "INTERNAL",
      source: "trading engine",
      status: "success",
      metadata: {
        tradeId: trade._id,
        txnType: "TRADING",
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
    const now = new Date();
    const activeTrades = await Trade.find({ status: "active" });
    const globalRoiRatePerMinute = await getTradingRoiRatePerMinute();
    let credited = 0;

    for (const trade of activeTrades) {
      const result = await settleTradeIncome(trade, now, globalRoiRatePerMinute);
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

  settleActiveTrades().catch((error) => {
    console.error("Initial trade engine cycle failed", error);
  });

  engineTimer = setInterval(() => {
    settleActiveTrades().catch((error) => {
      console.error("Trade engine cycle failed", error);
    });
  }, TRADE_ENGINE_INTERVAL_MS);
};

export const stopTradeEngine = () => {
  if (!engineTimer) {
    return;
  }
  clearInterval(engineTimer);
  engineTimer = null;
  engineRunning = false;
};

export const getTradeEngineConfig = () => ({
  roiRatePerMinute: DEFAULT_ROI_RATE_PER_MINUTE,
  dailyRoiPercent: DEFAULT_DAILY_ROI_PERCENT,
  tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
  intervalMs: TRADE_ENGINE_INTERVAL_MS,
});

export const getCurrentTradeEngineConfig = async () => {
  const roiRatePerMinute = await getTradingRoiRatePerMinute();
  return {
    roiRatePerMinute,
    dailyRoiPercent: Number((roiRatePerMinute * 1440 * 100).toFixed(6)),
    tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
    intervalMs: TRADE_ENGINE_INTERVAL_MS,
  };
};

export const getDefaultTradeLimit = (amount) => Number((amount * TRADE_LIMIT_MULTIPLIER).toFixed(2));
