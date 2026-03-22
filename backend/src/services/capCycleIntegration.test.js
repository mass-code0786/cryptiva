import test from "node:test";
import assert from "node:assert/strict";

import { applyIncomeWithCap, getIncomeCapState } from "./incomeCapService.js";
import { settleTradeIncome } from "./tradeEngineService.js";
import { distributeLevelIncomeOnTradingCredit } from "./levelIncomeSchedulerService.js";
import { creditDirectReferralCommission } from "./referralService.js";
import { buildWalletSummary } from "../controllers/walletController.js";

const ROI_RATE_PER_MINUTE_AT_1_2_DAILY = 1.2 / 100 / 1440;

const createWallet = (userId, overrides = {}) => ({
  userId,
  depositWallet: 0,
  withdrawalWallet: 0,
  balance: 0,
  tradingBalance: 0,
  tradingWallet: 0,
  tradingIncomeWallet: 0,
  referralIncomeWallet: 0,
  levelIncomeWallet: 0,
  salaryIncomeWallet: 0,
  capCycleVersion: 0,
  capCycleStartedAt: null,
  capCycleIncomeOffset: {
    tradingIncomeWallet: 0,
    referralIncomeWallet: 0,
    levelIncomeWallet: 0,
    salaryIncomeWallet: 0,
  },
  saveCalls: 0,
  save: async function save() {
    this.saveCalls += 1;
    return this;
  },
  toObject: function toObject() {
    return { ...this };
  },
  ...overrides,
});

const createCapDeps = ({ wallet, trades }) => {
  const settings = new Map();
  return {
    logger: { info: () => {}, warn: () => {} },
    WalletModel: {
      findOne: async () => wallet,
      create: async () => wallet,
    },
    SettingModel: {
      updateOne: async (query, update, options) => {
        const key = String(query.key);
        if (settings.has(key)) return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
        if (options?.upsert) {
          settings.set(key, update.$setOnInsert);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: key };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      },
    },
    TradeModel: {
      findOne: (query) => ({
        sort: () => ({
          select: async () => {
            const filtered = trades
              .filter((trade) => String(trade.userId) === String(query.userId) && Number(trade.amount || 0) > 0)
              .filter((trade) => !query.createdAt?.$lte || trade.createdAt <= query.createdAt.$lte)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            const selected = filtered[0];
            return selected ? { _id: selected._id, createdAt: selected.createdAt } : null;
          },
        }),
      }),
      find: (query) => {
        const rows = trades
          .filter((trade) => String(trade.userId) === String(query.userId))
          .filter((trade) => (query.status ? String(trade.status) === String(query.status) : true))
          .map((trade) => ({ amount: trade.amount }));
        return {
          select: async () => rows,
        };
      },
      updateMany: async (query, update) => {
        let modifiedCount = 0;
        for (const trade of trades) {
          const matchesUser = String(trade.userId) === String(query.userId);
          const matchesStatus = String(trade.status) === String(query.status);
          const matchesCreatedAt = !query.createdAt?.$lte || trade.createdAt <= query.createdAt.$lte;
          if (matchesUser && matchesStatus && matchesCreatedAt) {
            trade.status = update.$set.status;
            trade.amount = update.$set.amount;
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      },
    },
    TransactionModel: {
      insertMany: async () => [],
    },
    hasActiveReferralFn: async () => false,
    acquireCapLockFn: async ({ key }) => ({ acquired: true, key, owner: "test-owner" }),
    releaseCapLockFn: async () => ({ released: true }),
  };
};

test("partial-cap direct referral is credited after fresh restart", async () => {
  const sponsorId = "507f1f77bcf86cd799439301";
  const traderId = "507f1f77bcf86cd799439302";
  const sponsorWallet = createWallet(sponsorId, {
    tradingWallet: 5,
    tradingBalance: 5,
    referralIncomeWallet: 25,
    capCycleVersion: 1,
    capCycleStartedAt: new Date("2026-03-22T10:00:00.000Z"),
    capCycleIncomeOffset: {
      tradingIncomeWallet: 0,
      referralIncomeWallet: 25,
      levelIncomeWallet: 0,
      salaryIncomeWallet: 0,
    },
  });
  const sponsorTrades = [
    {
      _id: "507f1f77bcf86cd799439303",
      userId: sponsorId,
      status: "active",
      amount: 5,
      createdAt: new Date("2026-03-22T10:05:00.000Z"),
    },
  ];
  const capDeps = createCapDeps({ wallet: sponsorWallet, trades: sponsorTrades });
  const referralRows = [];
  const idempotencyLocks = new Set();
  const sponsor = { _id: sponsorId, userId: "ABCD", email: "abcd@example.com" };
  const trader = { _id: traderId, userId: "ABCD2", email: "abcd2@example.com", referredByUserId: "ABCD" };

  const result = await creditDirectReferralCommission({
    traderUser: trader,
    transactionAmount: 1000,
    eventType: "trade_start",
    eventId: "507f1f77bcf86cd799439304",
    eventStatus: "success",
    deps: {
      logger: { info: () => {}, warn: () => {} },
      UserModel: {
        findById: async () => sponsor,
        findOne: async () => sponsor,
      },
      ReferralIncomeModel: {
        findOne: async () => null,
        create: async (payload) => {
          referralRows.push(payload);
          return payload;
        },
      },
      applyIncomeWithCapFn: async (args) => applyIncomeWithCap({ ...args, deps: capDeps }),
      addTransactionFn: async () => {},
      logIncomeEventFn: async () => {},
      acquireIdempotencyLockFn: async ({ key }) => {
        const lockKey = String(key || "");
        if (idempotencyLocks.has(lockKey)) return { acquired: false, key: lockKey };
        idempotencyLocks.add(lockKey);
        return { acquired: true, key: lockKey };
      },
    },
  });

  assert.equal(result.credited, 12.5);
  assert.equal(referralRows.length, 1);
  assert.equal(sponsorWallet.referralIncomeWallet, 37.5);
});

test("ROI settlement credits successfully after fresh restart", async () => {
  const userId = "507f1f77bcf86cd799439311";
  const wallet = createWallet(userId, {
    tradingWallet: 0,
    tradingBalance: 0,
    tradingIncomeWallet: 10,
    capCycleVersion: 1,
    capCycleStartedAt: new Date("2026-03-22T10:00:00.000Z"),
    capCycleIncomeOffset: {
      tradingIncomeWallet: 10,
      referralIncomeWallet: 0,
      levelIncomeWallet: 0,
      salaryIncomeWallet: 0,
    },
  });
  const trades = [
    {
      _id: "507f1f77bcf86cd799439312",
      userId,
      status: "active",
      amount: 5,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
    },
  ];
  const capDeps = createCapDeps({ wallet, trades });
  const trade = {
    _id: "507f1f77bcf86cd799439312",
    userId,
    status: "active",
    amount: 5,
    totalIncome: 0,
    roiGenerated: 0,
    createdAt: new Date("2026-03-22T10:00:00.000Z"),
    lastSettledAt: new Date("2026-03-22T10:00:00.000Z"),
    save: async function save() {
      return this;
    },
  };

  const result = await settleTradeIncome(
    trade,
    new Date("2026-03-22T13:00:00.000Z"),
    ROI_RATE_PER_MINUTE_AT_1_2_DAILY,
    {
      ensureWalletFn: async () => wallet,
      restoreTradingPrincipalFromActiveTradesFn: async (walletDoc) => {
        walletDoc.tradingWallet = 5;
        walletDoc.tradingBalance = 5;
        return 5;
      },
      applyIncomeWithCapFn: async (args) => applyIncomeWithCap({ ...args, deps: capDeps }),
      createTransactionFn: async () => {},
      logIncomeEventFn: async () => {},
      distributeLevelIncomeOnTradingCreditFn: async () => {},
    }
  );

  assert.equal(result.completed, false);
  assert.equal(result.settledAmount > 0, true);
  assert.equal(wallet.tradingWallet, 5);
  assert.equal(wallet.tradingIncomeWallet > 10, true);
});

test("level income credits after fresh restart in current cycle", async () => {
  const uplineId = "507f1f77bcf86cd799439321";
  const traderId = "507f1f77bcf86cd799439322";
  const uplineWallet = createWallet(uplineId, {
    tradingWallet: 5,
    tradingBalance: 5,
    levelIncomeWallet: 20,
    capCycleVersion: 1,
    capCycleStartedAt: new Date("2026-03-22T10:00:00.000Z"),
    capCycleIncomeOffset: {
      tradingIncomeWallet: 0,
      referralIncomeWallet: 0,
      levelIncomeWallet: 20,
      salaryIncomeWallet: 0,
    },
  });
  const uplineTrades = [
    {
      _id: "507f1f77bcf86cd799439323",
      userId: uplineId,
      status: "active",
      amount: 5,
      createdAt: new Date("2026-03-22T10:05:00.000Z"),
    },
  ];
  const capDeps = createCapDeps({ wallet: uplineWallet, trades: uplineTrades });
  capDeps.hasActiveReferralFn = async () => true;
  const referralRows = [];
  const transactions = [];
  const incomeLogs = [];
  const locks = new Set();

  const result = await distributeLevelIncomeOnTradingCredit({
    traderUserId: traderId,
    traderTradeId: "507f1f77bcf86cd799439324",
    roiAmount: 10,
    roiEventKey: "evt:restart:1",
    recordedAt: new Date("2026-03-22T13:00:00.000Z"),
    deps: {
      logger: { info: () => {}, warn: () => {} },
      resolvers: {
        getById: async (id) => {
          if (String(id) === String(traderId)) {
            return { _id: traderId, userId: "ABCD2", email: "abcd2@example.com", referredBy: uplineId };
          }
          if (String(id) === String(uplineId)) {
            return { _id: uplineId, userId: "ABCD", email: "abcd@example.com" };
          }
          return null;
        },
        getByUserId: async () => null,
      },
      getQualifiedDirectCountFn: async () => 1,
      ReferralIncomeModel: {
        findOne: () => ({ select: async () => null }),
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
      applyIncomeWithCapFn: async (args) => applyIncomeWithCap({ ...args, deps: capDeps }),
      logIncomeEventFn: async (payload) => {
        incomeLogs.push(payload);
      },
      acquireIdempotencyLockFn: async ({ key }) => {
        const lockKey = String(key || "");
        if (locks.has(lockKey)) return { acquired: false, key: lockKey };
        locks.add(lockKey);
        return { acquired: true, key: lockKey };
      },
    },
  });

  assert.equal(result.payouts, 1);
  assert.equal(referralRows.length, 1);
  assert.equal(transactions.length, 1);
  assert.equal(incomeLogs.length, 1);
  assert.equal(uplineWallet.levelIncomeWallet, 21.2);
});

test("wallet dashboard summary shows cycle-scoped cap figures after reset and re-trade", async () => {
  const userId = "507f1f77bcf86cd799439331";
  const wallet = createWallet(userId, {
    tradingWallet: 5,
    tradingBalance: 5,
    referralIncomeWallet: 37.5,
    capCycleVersion: 2,
    capCycleStartedAt: new Date("2026-03-22T10:30:00.000Z"),
    capCycleIncomeOffset: {
      tradingIncomeWallet: 0,
      referralIncomeWallet: 25,
      levelIncomeWallet: 0,
      salaryIncomeWallet: 0,
    },
  });
  const state = await getIncomeCapState(userId, {
    WalletModel: {
      findOne: async () => wallet,
      create: async () => wallet,
    },
    hasActiveReferralFn: async () => false,
    logger: { info: () => {}, warn: () => {} },
  });

  const summary = buildWalletSummary(wallet, state);

  assert.equal(summary.currentCapAmount, 12.5);
  assert.equal(summary.totalIncomeCounted, 12.5);
  assert.equal(summary.remainingCap, 0);
  assert.equal(summary.isWorkingUser, false);
});
