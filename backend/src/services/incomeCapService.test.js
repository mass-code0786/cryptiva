import test from "node:test";
import assert from "node:assert/strict";

import { applyIncomeWithCap, executeCapitalResetOnCapReached, getIncomeCapState } from "./incomeCapService.js";

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
