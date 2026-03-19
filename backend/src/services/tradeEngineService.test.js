import test from "node:test";
import assert from "node:assert/strict";

import { settleActiveTrades, settleTradeIncome } from "./tradeEngineService.js";

const ROI_RATE_PER_MINUTE_AT_1_2_DAILY = 1.2 / 100 / 1440;

const createTrade = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439021",
  userId: "507f191e810c19729de860eb",
  status: "active",
  amount: 1000,
  totalIncome: 0,
  roiGenerated: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  lastSettledAt: new Date("2026-01-01T00:00:00.000Z"),
  manualRoiRate: null,
  save: async function save() {
    return this;
  },
  ...overrides,
});

const createDeps = () => {
  const requestedAmounts = [];
  const transactions = [];
  const incomeLogs = [];
  const realtimeLevelCalls = [];

  return {
    requestedAmounts,
    transactions,
    incomeLogs,
    deps: {
      ensureWalletFn: async () => ({ tradingWallet: 1000, tradingBalance: 1000 }),
      applyIncomeWithCapFn: async ({ requestedAmount }) => {
        requestedAmounts.push(Number(requestedAmount));
        return { creditedAmount: Number(requestedAmount) };
      },
      createTransactionFn: async (payload) => {
        transactions.push(payload);
      },
      logIncomeEventFn: async (payload) => {
        incomeLogs.push(payload);
      },
      distributeLevelIncomeOnTradingCreditFn: async (payload) => {
        realtimeLevelCalls.push(payload);
      },
    },
    realtimeLevelCalls,
  };
};

test("one 3-hour settlement credits 0.15% at 1.2% daily ROI", async () => {
  const trade = createTrade();
  const { deps, requestedAmounts, transactions, incomeLogs, realtimeLevelCalls } = createDeps();
  const now = new Date("2026-01-01T03:00:00.000Z");

  const result = await settleTradeIncome(trade, now, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);

  assert.equal(result.settledAmount, 1.5);
  assert.equal(requestedAmounts.length, 1);
  assert.equal(requestedAmounts[0], 1.5);
  assert.equal(trade.totalIncome, 1.5);
  assert.equal(trade.roiGenerated, 1.5);
  assert.equal(trade.lastSettledAt.toISOString(), "2026-01-01T03:00:00.000Z");
  assert.equal(transactions.length, 1);
  assert.equal(incomeLogs.length, 1);
  assert.equal(realtimeLevelCalls.length, 1);
});

test("eight 3-hour settlements over 24h total 1.2% and no drift", async () => {
  const trade = createTrade();
  const { deps, requestedAmounts } = createDeps();
  let totalCredited = 0;
  const startMs = Date.parse("2026-01-01T00:00:00.000Z");

  for (let i = 1; i <= 8; i += 1) {
    const now = new Date(startMs + i * 3 * 60 * 60 * 1000);
    const result = await settleTradeIncome(trade, now, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);
    totalCredited = Number((totalCredited + result.settledAmount).toFixed(6));
  }

  assert.equal(requestedAmounts.length, 8);
  assert.equal(totalCredited, 12);
  assert.equal(trade.totalIncome, 12);
  assert.equal(trade.roiGenerated, 12);
});

test("does not over-credit before interval or on repeated same-window calls", async () => {
  const trade = createTrade();
  const { deps, requestedAmounts } = createDeps();

  const beforeWindow = new Date("2026-01-01T02:59:00.000Z");
  const atWindow = new Date("2026-01-01T03:00:00.000Z");

  const first = await settleTradeIncome(trade, beforeWindow, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);
  const second = await settleTradeIncome(trade, atWindow, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);
  const third = await settleTradeIncome(trade, atWindow, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);

  assert.equal(first.settledAmount, 0);
  assert.equal(second.settledAmount, 1.5);
  assert.equal(third.settledAmount, 0);
  assert.equal(requestedAmounts.length, 1);
  assert.equal(trade.totalIncome, 1.5);
});

test("level income is triggered immediately on each ROI credit event", async () => {
  const trade = createTrade();
  const { deps, realtimeLevelCalls } = createDeps();
  const now = new Date("2026-01-01T03:00:00.000Z");

  const result = await settleTradeIncome(trade, now, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);

  assert.equal(result.settledAmount, 1.5);
  assert.equal(realtimeLevelCalls.length, 1);
  assert.equal(Number(realtimeLevelCalls[0].roiAmount), 1.5);
  assert.equal(String(realtimeLevelCalls[0].traderTradeId), String(trade._id));
  assert.equal(
    realtimeLevelCalls[0].roiEventKey,
    `${String(trade._id)}:${new Date("2026-01-01T03:00:00.000Z").toISOString()}`
  );
});

test("no further ROI is generated after cap reached event", async () => {
  let saveCalls = 0;
  const trade = createTrade({
    save: async function save() {
      saveCalls += 1;
      return this;
    },
  });
  let updateTradeIncomeOnCapCalls = 0;
  const { deps, transactions, incomeLogs, realtimeLevelCalls } = createDeps();
  deps.applyIncomeWithCapFn = async () => ({ creditedAmount: 0, capReached: true });
  deps.updateTradeIncomeOnCapFn = async () => {
    updateTradeIncomeOnCapCalls += 1;
  };
  const now = new Date("2026-01-01T03:00:00.000Z");

  const result = await settleTradeIncome(trade, now, ROI_RATE_PER_MINUTE_AT_1_2_DAILY, deps);

  assert.equal(result.settledAmount, 0);
  assert.equal(result.completed, true);
  assert.equal(saveCalls, 0);
  assert.equal(updateTradeIncomeOnCapCalls, 0);
  assert.equal(transactions.length, 0);
  assert.equal(incomeLogs.length, 0);
  assert.equal(realtimeLevelCalls.length, 0);
});

test("settleActiveTrades skips cycle when distributed lock is not acquired", async () => {
  let settleCalls = 0;

  const result = await settleActiveTrades({
    acquireSettlementLockFn: async () => ({ acquired: false, key: "k", owner: "o" }),
    TradeModel: {
      find: async () => [
        { _id: "t1", status: "active" },
        { _id: "t2", status: "active" },
      ],
    },
    settleTradeIncomeFn: async () => {
      settleCalls += 1;
      return { settledAmount: 1 };
    },
  });

  assert.equal(result.processed, 0);
  assert.equal(result.credited, 0);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "lock_not_acquired");
  assert.equal(settleCalls, 0);
});

test("settleActiveTrades extends lock heartbeat and logs cycle duration", async () => {
  let extendCalls = 0;
  let releaseCalls = 0;
  const logs = [];

  const result = await settleActiveTrades({
    logger: {
      info: (message) => logs.push(String(message)),
      warn: (message) => logs.push(String(message)),
    },
    acquireSettlementLockFn: async () => ({ acquired: true, key: "trade_engine:settle_active_trades:v1", owner: "instance-a" }),
    extendSettlementLockFn: async () => {
      extendCalls += 1;
      return { extended: true };
    },
    releaseSettlementLockFn: async () => {
      releaseCalls += 1;
      return { released: true };
    },
    TradeModel: {
      find: async () => [{ _id: "t1", status: "active" }],
    },
    getTradingRoiRatePerMinuteFn: async () => ROI_RATE_PER_MINUTE_AT_1_2_DAILY,
    settleTradeIncomeFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { settledAmount: 1 };
    },
    lockTtlMs: 30,
    lockHeartbeatMs: 5,
  });

  assert.equal(result.processed, 1);
  assert.equal(result.credited, 1);
  assert.equal(extendCalls > 0, true);
  assert.equal(releaseCalls, 1);
  assert.equal(logs.some((line) => line.includes("durationMs=")), true);
  assert.equal(logs.some((line) => line.includes("lockTtlMs=")), true);
});
