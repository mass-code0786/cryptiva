import test from "node:test";
import assert from "node:assert/strict";

import { applyIncomeWithCap, executeCapitalResetOnCapReached, getIncomeCapState, getQualifiedDirectCountForWorkingUser } from "./incomeCapService.js";

const USER_ID = "507f191e810c19729de860eb";

const createWallet = (overrides = {}) => {
  const wallet = {
    userId: USER_ID,
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
    ...overrides,
  };
  return wallet;
};

const walletModelFor = (wallet) => ({
  findOne: async () => wallet,
  create: async () => wallet,
});

const createCapLockMocks = () => {
  let locked = false;
  return {
    acquireCapLockFn: async ({ key }) => {
      if (locked) {
        return { acquired: false, key, owner: "test-owner" };
      }
      locked = true;
      return { acquired: true, key, owner: "test-owner" };
    },
    releaseCapLockFn: async () => {
      locked = false;
      return { released: true };
    },
  };
};

test("non-working user cap multiplier is 2.5x", async () => {
  const wallet = createWallet({ tradingWallet: 100, tradingBalance: 100 });

  const state = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    hasActiveReferralFn: async () => false,
  });

  assert.equal(state.workingUser, false);
  assert.equal(state.investmentBase, 100);
  assert.equal(state.maxCap, 250);
});

test("working user cap multiplier is 4x", async () => {
  const wallet = createWallet({ tradingWallet: 100, tradingBalance: 100 });

  const state = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    hasActiveReferralFn: async () => true,
  });

  assert.equal(state.workingUser, true);
  assert.equal(state.investmentBase, 100);
  assert.equal(state.maxCap, 400);
});

test("0 qualified directs -> non-working", async () => {
  const UserModel = {
    findById: () => ({ select: async () => ({ _id: USER_ID, userId: "CTV-U1" }) }),
    find: async () => [],
  };
  const qualifiedDirectCount = await getQualifiedDirectCountForWorkingUser(USER_ID, {
    UserModel,
    getActivationInvestmentByUserIdsFn: async () => new Map(),
  });
  assert.equal(qualifiedDirectCount, 0);
});

test("4 qualified directs -> non-working (2.5x)", async () => {
  const wallet = createWallet({ tradingWallet: 100, tradingBalance: 100 });
  const state = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    getQualifiedDirectCountFn: async () => 4,
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(state.qualifiedDirectCount, 4);
  assert.equal(state.workingUser, false);
  assert.equal(state.capMultiplier, 2.5);
  assert.equal(state.maxCap, 250);
});

test("5 qualified directs -> working (4x)", async () => {
  const wallet = createWallet({ tradingWallet: 100, tradingBalance: 100 });
  const state = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    getQualifiedDirectCountFn: async () => 5,
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(state.qualifiedDirectCount, 5);
  assert.equal(state.workingUser, true);
  assert.equal(state.capMultiplier, 4);
  assert.equal(state.maxCap, 400);
});

test("mixed directs with less than $100 are not counted", async () => {
  const directUsers = [{ _id: "d1" }, { _id: "d2" }, { _id: "d3" }, { _id: "d4" }, { _id: "d5" }];
  const UserModel = {
    findById: () => ({ select: async () => ({ _id: USER_ID, userId: "CTV-U2" }) }),
    find: async () => directUsers,
  };
  const qualifiedDirectCount = await getQualifiedDirectCountForWorkingUser(USER_ID, {
    UserModel,
    getActivationInvestmentByUserIdsFn: async () =>
      new Map([
        ["d1", 150],
        ["d2", 100],
        ["d3", 99.99],
        ["d4", 20],
        ["d5", 0],
      ]),
  });

  assert.equal(qualifiedDirectCount, 2);
});

test("cap multiplier switches to 4x only at 5 qualified directs", async () => {
  const wallet = createWallet({ tradingWallet: 200, tradingBalance: 200 });

  const fourQualified = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    getQualifiedDirectCountFn: async () => 4,
    logger: { info: () => {}, warn: () => {} },
  });
  const fiveQualified = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    getQualifiedDirectCountFn: async () => 5,
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(fourQualified.capMultiplier, 2.5);
  assert.equal(fiveQualified.capMultiplier, 4);
  assert.equal(fourQualified.maxCap, 500);
  assert.equal(fiveQualified.maxCap, 800);
});

test("income stops after cap is reached", async () => {
  const wallet = createWallet({
    tradingWallet: 100,
    tradingBalance: 100,
    tradingIncomeWallet: 250,
    withdrawalWallet: 250,
    balance: 250,
  });
  let resetCalls = 0;

  const result = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 10,
    walletField: "tradingIncomeWallet",
    deps: {
      ...createCapLockMocks(),
      WalletModel: walletModelFor(wallet),
      hasActiveReferralFn: async () => false,
      executeCapitalResetOnCapReachedFn: async () => {
        resetCalls += 1;
        return { executed: true };
      },
      logger: { info: () => {}, warn: () => {} },
    },
  });

  assert.equal(result.creditedAmount, 0);
  assert.equal(result.capReached, true);
  assert.equal(resetCalls, 1);
});

test("capital reset closes active trades, zeroes trading capital, and prevents duplicate reset in same cycle", async () => {
  const settings = new Map();
  const trades = [
    { userId: USER_ID, status: "active", amount: 100 },
    { userId: USER_ID, status: "active", amount: 40 },
    { userId: USER_ID, status: "completed", amount: 10 },
  ];
  const wallet = createWallet({
    depositWallet: 30,
    withdrawalWallet: 70,
    balance: 100,
    tradingWallet: 140,
    tradingBalance: 140,
  });
  let updateManyCalls = 0;

  const deps = {
    logger: { info: () => {}, warn: () => {} },
    SettingModel: {
      updateOne: async (query, update, options) => {
        const key = String(query.key);
        if (settings.has(key)) {
          return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
        }
        if (options?.upsert) {
          settings.set(key, update.$setOnInsert);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: key };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      },
    },
    TradeModel: {
      findOne: () => ({
        sort: () => ({
          select: async () => ({ _id: "trade_cycle_1" }),
        }),
      }),
      find: async () => [],
      updateMany: async (query, update) => {
        updateManyCalls += 1;
        let modifiedCount = 0;
        for (const trade of trades) {
          if (String(trade.userId) === String(query.userId) && String(trade.status) === "active") {
            trade.status = update.$set.status;
            trade.amount = update.$set.amount;
            trade.closedAt = update.$set.closedAt;
            trade.lastSettledAt = update.$set.lastSettledAt;
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      },
    },
    WalletModel: walletModelFor(wallet),
  };

  const first = await executeCapitalResetOnCapReached({ userId: USER_ID, deps });
  const second = await executeCapitalResetOnCapReached({ userId: USER_ID, deps });

  assert.equal(first.executed, true);
  assert.equal(first.cycleId, "trade_trade_cycle_1");
  assert.equal(first.activeTradesClosed, 2);
  assert.equal(second.executed, false);
  assert.equal(updateManyCalls, 1);
  assert.equal(wallet.tradingWallet, 0);
  assert.equal(wallet.tradingBalance, 0);
  assert.equal(wallet.depositWallet, 30);
  assert.equal(wallet.withdrawalWallet, 70);
  assert.equal(wallet.balance, 100);
  assert.equal(
    trades.filter((trade) => trade.status === "active").length,
    0
  );
  assert.equal(
    trades.filter((trade) => trade.amount === 0 && trade.status === "completed").length,
    2
  );
});

test("capital reset runs again for a new trading cycle", async () => {
  const settings = new Map();
  let cycle = 1;
  let updateManyCalls = 0;
  const wallet = createWallet({
    depositWallet: 10,
    withdrawalWallet: 20,
    balance: 30,
    tradingWallet: 100,
    tradingBalance: 100,
  });

  const deps = {
    logger: { info: () => {}, warn: () => {} },
    SettingModel: {
      updateOne: async (query, update, options) => {
        const key = String(query.key);
        if (settings.has(key)) {
          return { matchedCount: 1, modifiedCount: 0, upsertedCount: 0 };
        }
        if (options?.upsert) {
          settings.set(key, update.$setOnInsert);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: key };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      },
    },
    TradeModel: {
      findOne: () => ({
        sort: () => ({
          select: async () => ({ _id: cycle === 1 ? "trade_cycle_1" : "trade_cycle_2" }),
        }),
      }),
      find: async () => [],
      updateMany: async () => {
        updateManyCalls += 1;
        return { modifiedCount: 1 };
      },
    },
    WalletModel: walletModelFor(wallet),
  };

  const firstCycle = await executeCapitalResetOnCapReached({ userId: USER_ID, deps });
  const firstCycleRetry = await executeCapitalResetOnCapReached({ userId: USER_ID, deps });
  cycle = 2;
  wallet.tradingWallet = 200;
  wallet.tradingBalance = 200;
  const secondCycle = await executeCapitalResetOnCapReached({ userId: USER_ID, deps });

  assert.equal(firstCycle.executed, true);
  assert.equal(firstCycleRetry.executed, false);
  assert.equal(secondCycle.executed, true);
  assert.equal(firstCycle.cycleId, "trade_trade_cycle_1");
  assert.equal(secondCycle.cycleId, "trade_trade_cycle_2");
  assert.equal(updateManyCalls, 2);
});

test("cap reached on credit triggers reset and only credits remaining cap", async () => {
  const wallet = createWallet({
    tradingWallet: 100,
    tradingBalance: 100,
    tradingIncomeWallet: 245,
    withdrawalWallet: 245,
    balance: 245,
  });
  let resetCalls = 0;

  const result = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 10,
    walletField: "tradingIncomeWallet",
    deps: {
      ...createCapLockMocks(),
      WalletModel: walletModelFor(wallet),
      hasActiveReferralFn: async () => false,
      executeCapitalResetOnCapReachedFn: async () => {
        resetCalls += 1;
        return { executed: true };
      },
      logger: { info: () => {}, warn: () => {} },
    },
  });

  assert.equal(result.creditedAmount, 5);
  assert.equal(result.capReached, true);
  assert.equal(resetCalls, 1);
  assert.equal(wallet.tradingIncomeWallet, 250);
  assert.equal(wallet.withdrawalWallet, 250);
});

test("once cap is reached, no income type is credited anymore", async () => {
  const wallet = createWallet({
    tradingWallet: 100,
    tradingBalance: 100,
    tradingIncomeWallet: 400,
    withdrawalWallet: 400,
    balance: 400,
  });
  let resetCalls = 0;

  const baseDeps = {
    ...createCapLockMocks(),
    WalletModel: walletModelFor(wallet),
    hasActiveReferralFn: async () => true,
    executeCapitalResetOnCapReachedFn: async () => {
      resetCalls += 1;
      return { executed: resetCalls === 1 };
    },
    logger: { info: () => {}, warn: () => {} },
  };

  const trading = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 5,
    walletField: "tradingIncomeWallet",
    deps: baseDeps,
  });
  const referral = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 5,
    walletField: "referralIncomeWallet",
    bypassWorkingUserRestriction: true,
    deps: baseDeps,
  });
  const level = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 5,
    walletField: "levelIncomeWallet",
    deps: baseDeps,
  });
  const salary = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 5,
    walletField: "salaryIncomeWallet",
    deps: baseDeps,
  });

  for (const item of [trading, referral, level, salary]) {
    assert.equal(item.creditedAmount, 0);
    assert.equal(item.capReached, true);
  }
});

test("concurrent credits do not over-credit beyond cap for same user", async () => {
  const wallet = createWallet({
    tradingWallet: 100,
    tradingBalance: 100,
    tradingIncomeWallet: 240,
    withdrawalWallet: 240,
    balance: 240,
  });
  const lockMocks = createCapLockMocks();
  let resetCalls = 0;

  const deps = {
    ...lockMocks,
    WalletModel: walletModelFor(wallet),
    hasActiveReferralFn: async () => false,
    executeCapitalResetOnCapReachedFn: async () => {
      resetCalls += 1;
      return { executed: true };
    },
    logger: { info: () => {}, warn: () => {} },
  };

  const [first, second] = await Promise.all([
    applyIncomeWithCap({
      userId: USER_ID,
      requestedAmount: 10,
      walletField: "tradingIncomeWallet",
      deps,
    }),
    applyIncomeWithCap({
      userId: USER_ID,
      requestedAmount: 10,
      walletField: "tradingIncomeWallet",
      deps,
    }),
  ]);

  assert.equal(first.creditedAmount + second.creditedAmount, 10);
  assert.equal(wallet.tradingIncomeWallet, 250);
  assert.equal(wallet.withdrawalWallet, 250);
  assert.equal(resetCalls >= 1, true);
});

test("exact-cap hit then fresh restart uses new cap cycle and credits referral again", async () => {
  const settings = new Map();
  const trades = [
    {
      _id: "507f1f77bcf86cd799439101",
      userId: USER_ID,
      status: "active",
      amount: 10,
      createdAt: new Date("2024-03-22T10:00:00.000Z"),
    },
  ];
  const wallet = createWallet({
    tradingWallet: 10,
    tradingBalance: 10,
    referralIncomeWallet: 0,
    withdrawalWallet: 0,
    balance: 0,
  });

  const deps = {
    ...createCapLockMocks(),
    logger: { info: () => {}, warn: () => {} },
    WalletModel: walletModelFor(wallet),
    hasActiveReferralFn: async () => false,
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
      find: async (query) =>
        trades
          .filter((trade) => String(trade.userId) === String(query.userId))
          .filter((trade) => (query.status ? String(trade.status) === String(query.status) : true))
          .map((trade) => ({ amount: trade.amount })),
      updateMany: async (query, update) => {
        let modifiedCount = 0;
        for (const trade of trades) {
          const matchesUser = String(trade.userId) === String(query.userId);
          const matchesStatus = String(trade.status) === String(query.status);
          const matchesCreatedAt = !query.createdAt?.$lte || trade.createdAt <= query.createdAt.$lte;
          if (matchesUser && matchesStatus && matchesCreatedAt) {
            trade.status = update.$set.status;
            trade.amount = update.$set.amount;
            trade.closedAt = update.$set.closedAt;
            trade.lastSettledAt = update.$set.lastSettledAt;
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      },
    },
  };

  const firstReferral = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 25,
    walletField: "referralIncomeWallet",
    bypassWorkingUserRestriction: true,
    deps,
  });

  assert.equal(firstReferral.creditedAmount, 25);
  assert.equal(firstReferral.capReached, true);
  assert.equal(wallet.capCycleVersion, 1);
  assert.equal(wallet.tradingWallet, 0);
  assert.equal(wallet.capCycleIncomeOffset.referralIncomeWallet, 25);

  trades.push({
    _id: "507f1f77bcf86cd799439102",
    userId: USER_ID,
    status: "active",
    amount: 5,
    createdAt: new Date("2024-03-22T10:05:00.000Z"),
  });
  wallet.tradingWallet = 5;
  wallet.tradingBalance = 5;

  const secondReferral = await applyIncomeWithCap({
    userId: USER_ID,
    requestedAmount: 50,
    walletField: "referralIncomeWallet",
    bypassWorkingUserRestriction: true,
    deps,
  });

  assert.equal(secondReferral.creditedAmount, 12.5);
  assert.equal(secondReferral.capReached, true);
  assert.equal(wallet.referralIncomeWallet, 37.5);
  assert.equal(wallet.capCycleVersion, 2);
});

test("no stale cap state remains after reset in a new trading cycle", async () => {
  const wallet = createWallet({
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

  const state = await getIncomeCapState(USER_ID, {
    WalletModel: walletModelFor(wallet),
    hasActiveReferralFn: async () => false,
    logger: { info: () => {}, warn: () => {} },
  });

  assert.equal(state.maxCap, 12.5);
  assert.equal(state.totalIncome, 0);
  assert.equal(state.remainingCap, 12.5);
  assert.equal(state.cycleIncome.referralIncomeWallet, 0);
});

test("reset does not close or zero trades created after reset boundary", async () => {
  const settings = new Map();
  const oldTradeTime = new Date("2026-03-22T10:00:00.000Z");
  const boundaryAt = new Date("2026-03-22T10:01:00.000Z");
  const newTradeTime = new Date("2026-03-22T10:02:00.000Z");
  const oldTradeId = "507f1f77bcf86cd799439111";
  const newTradeId = "507f1f77bcf86cd799439122";
  const trades = [
    { _id: oldTradeId, userId: USER_ID, status: "active", amount: 10, createdAt: oldTradeTime },
    { _id: newTradeId, userId: USER_ID, status: "active", amount: 5, createdAt: newTradeTime },
  ];
  const wallet = createWallet({
    tradingWallet: 15,
    tradingBalance: 15,
    referralIncomeWallet: 25,
  });

  const deps = {
    logger: { info: () => {}, warn: () => {} },
    WalletModel: walletModelFor(wallet),
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
            return selected ? { _id: selected._id } : null;
          },
        }),
      }),
      find: async (query) =>
        trades
          .filter((trade) => String(trade.userId) === String(query.userId))
          .filter((trade) => (query.status ? String(trade.status) === String(query.status) : true))
          .map((trade) => ({ amount: trade.amount })),
      updateMany: async (query, update) => {
        let modifiedCount = 0;
        for (const trade of trades) {
          const matchesUser = String(trade.userId) === String(query.userId);
          const matchesStatus = String(trade.status) === String(query.status);
          const matchesCreatedAt = !query.createdAt?.$lte || trade.createdAt <= query.createdAt.$lte;
          const matchesTradeId = !query._id?.$lte || String(trade._id) <= String(query._id.$lte);
          if (matchesUser && matchesStatus && matchesCreatedAt && matchesTradeId) {
            trade.status = update.$set.status;
            trade.amount = update.$set.amount;
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      },
    },
  };

  const resetResult = await executeCapitalResetOnCapReached({
    userId: USER_ID,
    boundaryAt,
    deps,
  });

  assert.equal(resetResult.executed, true);
  assert.equal(resetResult.activeTradesClosed, 1);
  assert.equal(trades[0].status, "completed");
  assert.equal(trades[0].amount, 0);
  assert.equal(trades[1].status, "active");
  assert.equal(trades[1].amount, 5);
  assert.equal(wallet.tradingWallet, 5);
  assert.equal(wallet.tradingBalance, 5);
});
