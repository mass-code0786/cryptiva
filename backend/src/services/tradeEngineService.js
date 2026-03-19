import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";
import { getTradingRoiRatePerMinute } from "./tradingSettingsService.js";
import { distributeLevelIncomeOnTradingCredit } from "./levelIncomeSchedulerService.js";
import { acquireDistributedLock, extendDistributedLock, releaseDistributedLock } from "./distributedLockService.js";

const TRADE_LIMIT_MULTIPLIER = Number(process.env.TRADE_LIMIT_MULTIPLIER || 2);
const TRADE_ENGINE_INTERVAL_MS = 60 * 1000;
const DEFAULT_DAILY_ROI_PERCENT = 1.2;
const DEFAULT_ROI_RATE_PER_MINUTE = Number((DEFAULT_DAILY_ROI_PERCENT / 100 / 1440).toFixed(8));
const ROI_SETTLEMENT_INTERVAL_HOURS = 3;
const ROI_SETTLEMENT_INTERVAL_MINUTES = ROI_SETTLEMENT_INTERVAL_HOURS * 60;
const ROI_SETTLEMENT_INTERVAL_MS = ROI_SETTLEMENT_INTERVAL_MINUTES * 60 * 1000;
const TRADE_ENGINE_LOCK_KEY = "trade_engine:settle_active_trades:v1";
const TRADE_ENGINE_LOCK_EXPECTED_EXEC_MS = Number(process.env.TRADE_ENGINE_LOCK_EXPECTED_EXEC_MS || 30 * 1000);
const TRADE_ENGINE_LOCK_SAFETY_FACTOR = Number(process.env.TRADE_ENGINE_LOCK_SAFETY_FACTOR || 2);
const TRADE_ENGINE_LOCK_TTL_MS = Math.max(
  Number(process.env.TRADE_ENGINE_LOCK_TTL_MS || 0),
  Math.ceil(TRADE_ENGINE_LOCK_EXPECTED_EXEC_MS * TRADE_ENGINE_LOCK_SAFETY_FACTOR),
  10 * 1000
);
const TRADE_ENGINE_LOCK_HEARTBEAT_MS = Math.max(2000, Math.floor(TRADE_ENGINE_LOCK_TTL_MS / 3));

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

const restoreTradingPrincipalFromActiveTrades = async (wallet, userId) => {
  const activeTrades = await Trade.find({ userId, status: "active" }).select("amount");
  const reconstructed = toAmount(activeTrades.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  if (reconstructed > 0) {
    wallet.tradingWallet = reconstructed;
    wallet.tradingBalance = reconstructed;
    await wallet.save();
  }
  return reconstructed;
};

export const settleTradeIncome = async (trade, now = new Date(), roiRatePerMinuteOverride = null, deps = {}) => {
  const ensureWalletFn = deps.ensureWalletFn || ensureWallet;
  const restoreTradingPrincipalFromActiveTradesFn =
    deps.restoreTradingPrincipalFromActiveTradesFn || restoreTradingPrincipalFromActiveTrades;
  const getTradingRoiRatePerMinuteFn = deps.getTradingRoiRatePerMinuteFn || getTradingRoiRatePerMinute;
  const applyIncomeWithCapFn = deps.applyIncomeWithCapFn || applyIncomeWithCap;
  const createTransactionFn = deps.createTransactionFn || ((payload) => Transaction.create(payload));
  const logIncomeEventFn = deps.logIncomeEventFn || logIncomeEvent;
  const distributeLevelIncomeOnTradingCreditFn = deps.distributeLevelIncomeOnTradingCreditFn || distributeLevelIncomeOnTradingCredit;
  const updateTradeIncomeOnCapFn =
    deps.updateTradeIncomeOnCapFn || ((tradeId, amountToAdd) => Trade.updateOne({ _id: tradeId }, { $inc: { totalIncome: amountToAdd, roiGenerated: amountToAdd } }));

  if (trade.status !== "active") {
    return { trade, settledAmount: 0, completed: false };
  }

  const lastSettledAt = new Date(trade.lastSettledAt || trade.startTime || trade.createdAt);
  const elapsedMs = now.getTime() - lastSettledAt.getTime();
  const elapsedWindows = Math.floor(elapsedMs / ROI_SETTLEMENT_INTERVAL_MS);
  if (elapsedWindows <= 0) {
    return { trade, settledAmount: 0, completed: false };
  }

  const nextLastSettledAt = new Date(lastSettledAt);
  nextLastSettledAt.setMinutes(nextLastSettledAt.getMinutes() + elapsedWindows * ROI_SETTLEMENT_INTERVAL_MINUTES);
  trade.lastSettledAt = nextLastSettledAt;

  const tradeAmount = Number(trade.amount || 0);
  if (tradeAmount <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  const wallet = await ensureWalletFn(trade.userId);
  let tradingPrincipal = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  if (tradingPrincipal <= 0) {
    tradingPrincipal = await restoreTradingPrincipalFromActiveTradesFn(wallet, trade.userId);
    if (tradingPrincipal <= 0) {
      await trade.save();
      return { trade, settledAmount: 0, completed: false };
    }
  }

  const effectiveRoiRatePerMinute = Number.isFinite(trade.manualRoiRate)
    ? Number(trade.manualRoiRate)
    : Number.isFinite(roiRatePerMinuteOverride)
      ? roiRatePerMinuteOverride
      : await getTradingRoiRatePerMinuteFn();

  const perMinuteIncome = tradeAmount * effectiveRoiRatePerMinute;
  const elapsedMinutes = elapsedWindows * ROI_SETTLEMENT_INTERVAL_MINUTES;
  const grossDelta = Number((perMinuteIncome * elapsedMinutes).toFixed(6));
  const delta = Math.max(0, grossDelta);

  if (delta <= 0) {
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }

  const { creditedAmount, capReached } = await applyIncomeWithCapFn({
    userId: trade.userId,
    requestedAmount: delta,
    walletField: "tradingIncomeWallet",
  });

  if (creditedAmount <= 0) {
    if (capReached) {
      return { trade, settledAmount: 0, completed: true };
    }
    await trade.save();
    return { trade, settledAmount: 0, completed: false };
  }
  trade.totalIncome = Number((trade.totalIncome + creditedAmount).toFixed(6));
  trade.roiGenerated = Number((Number(trade.roiGenerated || 0) + creditedAmount).toFixed(6));
  const roiEventKey = `${String(trade._id)}:${trade.lastSettledAt.toISOString()}`;

  const persistTradeIncomePromise = capReached
    ? updateTradeIncomeOnCapFn(trade._id, creditedAmount)
    : trade.save();

  await Promise.all([
    persistTradeIncomePromise,
    createTransactionFn({
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
        elapsedWindows,
        settlementIntervalHours: ROI_SETTLEMENT_INTERVAL_HOURS,
      },
    }),
    logIncomeEventFn({
      userId: trade.userId,
      incomeType: "trading",
      amount: creditedAmount,
      source: "trading engine",
      metadata: {
        tradeId: trade._id,
        roiRatePerMinute: effectiveRoiRatePerMinute,
        elapsedMinutes,
        elapsedWindows,
        settlementIntervalHours: ROI_SETTLEMENT_INTERVAL_HOURS,
      },
      recordedAt: now,
    }),
    distributeLevelIncomeOnTradingCreditFn({
      traderUserId: trade.userId,
      traderTradeId: trade._id,
      roiAmount: creditedAmount,
      roiEventKey,
      recordedAt: now,
    }),
  ]);

  return { trade, settledAmount: creditedAmount, completed: Boolean(capReached) };
};

export const settleActiveTrades = async (deps = {}) => {
  const logger = deps.logger || console;
  const acquireSettlementLockFn = deps.acquireSettlementLockFn || acquireDistributedLock;
  const extendSettlementLockFn = deps.extendSettlementLockFn || extendDistributedLock;
  const releaseSettlementLockFn = deps.releaseSettlementLockFn || releaseDistributedLock;
  const TradeModel = deps.TradeModel || Trade;
  const getTradingRoiRatePerMinuteFn = deps.getTradingRoiRatePerMinuteFn || getTradingRoiRatePerMinute;
  const settleTradeIncomeFn = deps.settleTradeIncomeFn || settleTradeIncome;
  const lockTtlMs = Number(deps.lockTtlMs) > 0 ? Number(deps.lockTtlMs) : TRADE_ENGINE_LOCK_TTL_MS;
  const lockHeartbeatMs = Number(deps.lockHeartbeatMs) > 0 ? Number(deps.lockHeartbeatMs) : TRADE_ENGINE_LOCK_HEARTBEAT_MS;

  if (engineRunning) {
    return { processed: 0, credited: 0 };
  }

  engineRunning = true;
  const startedAtMs = Date.now();
  let lock = null;
  let heartbeatTimer = null;
  try {
    lock = await acquireSettlementLockFn({
      key: TRADE_ENGINE_LOCK_KEY,
      ttlMs: lockTtlMs,
      deps,
    });
    if (!lock?.acquired) {
      logger.info(`[trade-engine] settlement skipped: reason=lock_not_acquired`);
      return { processed: 0, credited: 0, skipped: true, reason: "lock_not_acquired" };
    }
    heartbeatTimer = setInterval(() => {
      Promise.resolve(extendSettlementLockFn({ key: lock.key, owner: lock.owner, ttlMs: lockTtlMs, deps })).catch((error) => {
        logger.warn(`[trade-engine] lock heartbeat failed: ${error?.message || error}`);
      });
    }, lockHeartbeatMs);

    const now = new Date();
    const activeTrades = await TradeModel.find({ status: "active" });
    const globalRoiRatePerMinute = await getTradingRoiRatePerMinuteFn();
    let credited = 0;

    for (const trade of activeTrades) {
      const result = await settleTradeIncomeFn(trade, now, globalRoiRatePerMinute);
      if (result.settledAmount > 0) {
        credited += 1;
      }
    }

    const durationMs = Date.now() - startedAtMs;
    logger.info(
      `[trade-engine] settlement done: processed=${activeTrades.length} credited=${credited} durationMs=${durationMs} lockTtlMs=${lockTtlMs}`
    );
    return { processed: activeTrades.length, credited };
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (lock?.acquired) {
      try {
        await releaseSettlementLockFn({ key: lock.key, owner: lock.owner, deps });
      } catch (error) {
        console.error("Failed to release trade engine distributed lock", error);
      }
    }
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
  settlementIntervalHours: ROI_SETTLEMENT_INTERVAL_HOURS,
  tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
  intervalMs: TRADE_ENGINE_INTERVAL_MS,
});

export const getCurrentTradeEngineConfig = async () => {
  const roiRatePerMinute = await getTradingRoiRatePerMinute();
  return {
    roiRatePerMinute,
    dailyRoiPercent: Number((roiRatePerMinute * 1440 * 100).toFixed(6)),
    settlementIntervalHours: ROI_SETTLEMENT_INTERVAL_HOURS,
    tradeLimitMultiplier: TRADE_LIMIT_MULTIPLIER,
    intervalMs: TRADE_ENGINE_INTERVAL_MS,
  };
};

export const getDefaultTradeLimit = (amount) => Number((amount * TRADE_LIMIT_MULTIPLIER).toFixed(2));
