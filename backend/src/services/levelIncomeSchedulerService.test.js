import test from "node:test";
import assert from "node:assert/strict";

import {
  distributeLevelIncomeOnTradingCredit,
  runLevelIncomeDistribution12h,
  startLevelIncomeScheduler,
} from "./levelIncomeSchedulerService.js";

const USERS = {
  trader: { _id: "trader", userId: "TRADER", email: "trader@example.com", referredBy: "upline1" },
  upline1: { _id: "upline1", userId: "UPLINE1", email: "upline1@example.com", referredBy: "upline2" },
  upline2: { _id: "upline2", userId: "UPLINE2", email: "upline2@example.com" },
};

const createDeps = () => {
  const referralRows = [];
  const transactions = [];
  const incomeLogs = [];
  const idempotencyLocks = new Set();

  return {
    referralRows,
    transactions,
    incomeLogs,
    deps: {
      resolvers: {
        getById: async (id) => USERS[id] || null,
        getByUserId: async (userId) => Object.values(USERS).find((item) => item.userId === String(userId || "").toUpperCase()) || null,
      },
      ReferralIncomeModel: {
        findOne: (query) => ({
          select: async () =>
            referralRows.find((row) => {
              if (String(row.userId) !== String(query.userId)) return false;
              if (String(row.sourceUserId) !== String(query.sourceUserId)) return false;
              if (row.incomeType !== query.incomeType) return false;
              if (Number(row.level) !== Number(query.level)) return false;
              if (String(row.metadata?.trigger || "") !== String(query["metadata.trigger"] || "")) return false;
              if (String(row.metadata?.roiEventKey || "") !== String(query["metadata.roiEventKey"] || "")) return false;
              return Number(row.amount || 0) > 0;
            }) || null,
        }),
        create: async (payload) => {
          referralRows.push(payload);
          return payload;
        },
      },
      TransactionModel: {
        create: async (payload) => {
          transactions.push(payload);
          return payload;
        },
      },
      applyIncomeWithCapFn: async ({ requestedAmount }) => ({ creditedAmount: Number(requestedAmount) }),
      logIncomeEventFn: async (payload) => {
        incomeLogs.push(payload);
      },
      getActiveDirectCountFn: async () => 10,
      acquireIdempotencyLockFn: async ({ key }) => {
        const lockKey = String(key || "");
        if (idempotencyLocks.has(lockKey)) return { acquired: false, key: lockKey };
        idempotencyLocks.add(lockKey);
        return { acquired: true, key: lockKey };
      },
    },
  };
};

test("duplicate realtime ROI-event level distribution does not double-credit", async () => {
  const { deps, referralRows, transactions, incomeLogs } = createDeps();
  const payload = {
    traderUserId: USERS.trader._id,
    traderTradeId: "trade_001",
    roiAmount: 10,
    roiEventKey: "trade_001:2026-01-01T03:00:00.000Z",
    recordedAt: new Date("2026-01-01T03:00:00.000Z"),
    deps,
  };

  const first = await distributeLevelIncomeOnTradingCredit(payload);
  const second = await distributeLevelIncomeOnTradingCredit(payload);

  assert.equal(first.payouts, 2);
  assert.equal(second.payouts, 0);
  assert.equal(referralRows.length, 2);
  assert.equal(transactions.length, 2);
  assert.equal(incomeLogs.length, 2);
});

test("12-hour level income scheduler is disabled", async () => {
  const result = await runLevelIncomeDistribution12h(new Date("2026-01-01T12:00:00.000Z"));

  assert.equal(result.skipped, true);
  assert.equal(result.payouts, 0);
  assert.equal(result.creditedUsers, 0);
  assert.match(String(result.reason || ""), /disabled/i);
  assert.equal(startLevelIncomeScheduler(), undefined);
});

test("concurrent realtime level distribution creates one payout set only", async () => {
  const { deps, referralRows, transactions, incomeLogs } = createDeps();
  const payload = {
    traderUserId: USERS.trader._id,
    traderTradeId: "trade_002",
    roiAmount: 10,
    roiEventKey: "trade_002:2026-01-01T06:00:00.000Z",
    recordedAt: new Date("2026-01-01T06:00:00.000Z"),
    deps,
  };

  const [first, second] = await Promise.all([
    distributeLevelIncomeOnTradingCredit(payload),
    distributeLevelIncomeOnTradingCredit(payload),
  ]);

  assert.equal(first.payouts + second.payouts, 2);
  assert.equal(referralRows.length, 2);
  assert.equal(transactions.length, 2);
  assert.equal(incomeLogs.length, 2);
});

test("unlock-check logging does not crash when deps.logger is not provided", async () => {
  const { deps } = createDeps();
  const result = await distributeLevelIncomeOnTradingCredit({
    traderUserId: USERS.trader._id,
    traderTradeId: "trade_004",
    roiAmount: 10,
    roiEventKey: "trade_004:2026-01-01T12:00:00.000Z",
    recordedAt: new Date("2026-01-01T12:00:00.000Z"),
    deps,
  });

  assert.equal(result.payouts, 2);
  assert.equal(result.creditedUsers, 2);
});

test("level payout is skipped when target level is beyond unlocked range", async () => {
  const { deps, referralRows, transactions, incomeLogs } = createDeps();
  deps.getActiveDirectCountFn = async (upline) => {
    if (String(upline?._id) === "upline1") return 0; // unlocks 0 levels
    return 1; // unlocks 3 levels
  };

  const result = await distributeLevelIncomeOnTradingCredit({
    traderUserId: USERS.trader._id,
    traderTradeId: "trade_003",
    roiAmount: 10,
    roiEventKey: "trade_003:2026-01-01T09:00:00.000Z",
    recordedAt: new Date("2026-01-01T09:00:00.000Z"),
    deps,
  });

  assert.equal(result.payouts, 1);
  assert.equal(result.creditedUsers, 1);
  assert.equal(referralRows.length, 1);
  assert.equal(Number(referralRows[0].level), 2);
  assert.equal(String(referralRows[0].userId), "upline2");
  assert.equal(transactions.length, 1);
  assert.equal(incomeLogs.length, 1);
});
