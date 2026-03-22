import test from "node:test";
import assert from "node:assert/strict";

import { startTradeAndActivate } from "./tradeActivationService.js";

test("trade start creates negative trade_start transaction with tradeId metadata", async () => {
  const user = { _id: "507f191e810c19729de860eb", userId: "ABCD", email: "abcd@example.com" };
  const wallet = {
    userId: user._id,
    depositWallet: 100,
    withdrawalWallet: 0,
    tradingWallet: 0,
    tradingBalance: 0,
    balance: 100,
    save: async function save() {
      return this;
    },
  };
  const createdTransactions = [];
  let createdTrade = null;

  await startTradeAndActivate({
    user,
    amount: 10,
    deps: {
      logger: { info: () => {}, warn: () => {} },
      WalletModel: {
        findOne: async () => wallet,
        create: async () => wallet,
      },
      TradeModel: {
        find: () => ({ select: async () => [] }),
        create: async (payload) => {
          createdTrade = { _id: "507f1f77bcf86cd799439501", ...payload };
          return createdTrade;
        },
      },
      TransactionModel: {
        create: async (payload) => {
          createdTransactions.push(payload);
          return payload;
        },
      },
      PackagePurchaseModel: {
        create: async () => ({}),
      },
      activateUserByIdFn: async () => ({}),
      distributeUnilevelIncomeOnTradeStartFn: async () => ({}),
      syncTeamBusinessForUserAndUplinesFn: async () => ({}),
    },
  });

  const tradeStartTxn = createdTransactions.find((row) => String(row.type).toLowerCase() === "trade_start");
  assert.ok(tradeStartTxn);
  assert.equal(tradeStartTxn.amount, -10);
  assert.equal(tradeStartTxn.status, "completed");
  assert.equal(String(tradeStartTxn.metadata?.tradeId), String(createdTrade._id));
  assert.equal(String(tradeStartTxn.metadata?.source), "trading_funding");
});
