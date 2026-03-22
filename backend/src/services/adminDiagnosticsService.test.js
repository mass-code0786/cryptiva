import test from "node:test";
import assert from "node:assert/strict";

import { getUserCapCycleDiagnostics } from "./adminDiagnosticsService.js";

const USER_ID = "507f191e810c19729de860eb";

const makeUserModel = (user) => ({
  findById: async (id) => (String(id) === String(user?._id) ? user : null),
  findOne: async (query) => {
    if (!user) return null;
    if (query.userId && String(query.userId).toUpperCase() === String(user.userId || "").toUpperCase()) return user;
    if (query.referralCode && String(query.referralCode).toLowerCase() === String(user.referralCode || "").toLowerCase()) return user;
    if (query.username && String(query.username).toUpperCase() === String(user.username || "").toUpperCase()) return user;
    return null;
  },
});

test("returns single-user cap-cycle diagnostics payload", async () => {
  const user = { _id: USER_ID, userId: "ABCD", email: "abcd@example.com" };
  const wallet = {
    userId: USER_ID,
    tradingWallet: 5,
    tradingBalance: 5,
    capCycleVersion: 2,
    capCycleStartedAt: new Date("2026-03-22T10:30:00.000Z"),
    capCycleIncomeOffset: {
      tradingIncomeWallet: 1,
      referralIncomeWallet: 25,
      levelIncomeWallet: 0,
      salaryIncomeWallet: 0,
    },
  };
  const activeTrades = [{ amount: 3 }, { amount: 2 }];
  const latestReset = {
    key: `income_cap_reset_v2:${USER_ID}:trade_x`,
    valueString: "2026-03-22T10:31:00.000Z",
    metadata: {
      boundaryAt: "2026-03-22T10:30:59.000Z",
      resetAt: "2026-03-22T10:31:00.000Z",
      cycleId: "trade_x",
      trigger: "cap_reached_on_credit",
    },
  };

  const diagnostics = await getUserCapCycleDiagnostics({
    userRef: "abcd",
    deps: {
      UserModel: makeUserModel(user),
      WalletModel: {
        findOne: async () => wallet,
        create: async () => wallet,
      },
      TradeModel: {
        find: () => ({
          select: async () => activeTrades,
        }),
      },
      SettingModel: {
        findOne: () => ({
          sort: () => ({
            select: async () => latestReset,
          }),
        }),
      },
      getIncomeCapStateFn: async () => ({
        capCycleVersion: 2,
        capCycleStartedAt: wallet.capCycleStartedAt,
        cycleIncome: {
          tradingIncomeWallet: 0.5,
          referralIncomeWallet: 12.5,
          levelIncomeWallet: 0,
          salaryIncomeWallet: 0,
        },
        workingUser: false,
        maxCap: 12.5,
        totalIncome: 13,
        remainingCap: 0,
      }),
    },
  });

  assert.equal(diagnostics.user.userId, "ABCD");
  assert.equal(diagnostics.capCycleVersion, 2);
  assert.equal(diagnostics.currentCycleIncomeByType.referral, 12.5);
  assert.equal(diagnostics.currentCapAmount, 12.5);
  assert.equal(diagnostics.totalIncomeCounted, 13);
  assert.equal(diagnostics.remainingCap, 0);
  assert.equal(diagnostics.activeTradePrincipalSum, 5);
  assert.equal(diagnostics.walletTradingWallet, 5);
  assert.equal(diagnostics.latestResetBoundaryTimestamp, "2026-03-22T10:30:59.000Z");
});

test("returns null when user cannot be resolved", async () => {
  const diagnostics = await getUserCapCycleDiagnostics({
    userRef: "missing-user",
    deps: {
      UserModel: makeUserModel(null),
    },
  });

  assert.equal(diagnostics, null);
});
