import test from "node:test";
import assert from "node:assert/strict";

import Transaction from "../models/Transaction.js";
import Withdrawal from "../models/Withdrawal.js";
import { listTransactions } from "../controllers/transactionController.js";

test("transaction history response includes trade_start entries with negative amount and tradeId metadata", async () => {
  const originalCountDocuments = Transaction.countDocuments;
  const originalFind = Transaction.find;
  const originalWithdrawalAggregate = Withdrawal.aggregate;

  const userId = "507f191e810c19729de860eb";
  const tradeStartItem = {
    _id: "507f1f77bcf86cd799439601",
    userId,
    type: "trade_start",
    amount: -10,
    network: "INTERNAL",
    status: "completed",
    metadata: {
      tradeId: "507f1f77bcf86cd799439602",
      source: "trading_funding",
    },
    createdAt: new Date("2026-03-22T10:00:00.000Z"),
  };

  Transaction.countDocuments = async () => 1;
  Transaction.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: async () => [tradeStartItem],
      }),
    }),
  });
  Withdrawal.aggregate = async () => [{ _id: null, total: 0 }];

  const req = {
    user: { _id: userId },
    query: {},
  };

  try {
    const payload = await new Promise((resolve, reject) => {
      const res = {
        json: (body) => resolve(body),
      };
      listTransactions(req, res, reject);
    });

    assert.equal(Array.isArray(payload.items), true);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].type, "trade_start");
    assert.equal(payload.items[0].amount, -10);
    assert.equal(String(payload.items[0].metadata?.tradeId), "507f1f77bcf86cd799439602");
  } finally {
    Transaction.countDocuments = originalCountDocuments;
    Transaction.find = originalFind;
    Withdrawal.aggregate = originalWithdrawalAggregate;
  }
});
