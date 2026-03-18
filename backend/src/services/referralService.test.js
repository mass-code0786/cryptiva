import test from "node:test";
import assert from "node:assert/strict";

import { creditDirectReferralCommission } from "./referralService.js";

const SPONSOR = { _id: "507f1f77bcf86cd799439011", userId: "CTV-SPONSOR", email: "sponsor@example.com" };
const TRADER = {
  _id: "507f191e810c19729de860ea",
  userId: "CTV-TRADER",
  email: "trader@example.com",
  referredByUserId: "CTV-SPONSOR",
};

const findDirectIncome = (records, query) => {
  return records.find((row) => {
    if (String(row.userId) !== String(query.userId)) return false;
    if (String(row.sourceUserId) !== String(query.sourceUserId)) return false;
    if (row.incomeType !== query.incomeType) return false;

    if (query.tradeId && String(row.tradeId || "") !== String(query.tradeId)) return false;
    if (query.depositId && String(row.depositId || "") !== String(query.depositId)) return false;

    const eventFilter = query["metadata.event"];
    if (eventFilter) {
      const rowEvent = row?.metadata?.event || {};
      if (String(rowEvent.type || "") !== String(eventFilter.type || "")) return false;
      if (String(rowEvent.id || "") !== String(eventFilter.id || "")) return false;
    }

    return true;
  });
};

const buildDeps = ({ creditedAmount = 5 } = {}) => {
  const transactions = [];
  const incomeLogs = [];
  const referralIncomes = [];

  return {
    state: { transactions, incomeLogs, referralIncomes },
    deps: {
      logger: { info: () => {}, warn: () => {} },
      UserModel: {
        findById: async (id) => (String(id) === String(SPONSOR._id) ? SPONSOR : null),
        findOne: async (query) => (String(query?.userId || "").toUpperCase() === SPONSOR.userId ? SPONSOR : null),
      },
      ReferralIncomeModel: {
        findOne: async (query) => findDirectIncome(referralIncomes, query) || null,
        create: async (payload) => {
          referralIncomes.push(payload);
          return payload;
        },
      },
      applyIncomeWithCapFn: async () => ({ creditedAmount }),
      addTransactionFn: async (...args) => {
        transactions.push(args);
      },
      logIncomeEventFn: async (payload) => {
        incomeLogs.push(payload);
      },
    },
  };
};

test("credits 5% direct referral income for successful qualifying transaction", async () => {
  const { deps, state } = buildDeps({ creditedAmount: 5 });
  const depositId = "507f1f77bcf86cd799439012";

  const result = await creditDirectReferralCommission({
    traderUser: TRADER,
    transactionAmount: 100,
    eventType: "deposit_approved",
    eventId: depositId,
    eventStatus: "approved",
    deps,
  });

  assert.equal(result.credited, 5);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.incomeLogs.length, 1);
  assert.equal(state.referralIncomes.length, 1);
  assert.equal(String(state.referralIncomes[0].depositId), depositId);
});

test("does not credit commission when payment status is failed", async () => {
  const { deps, state } = buildDeps({ creditedAmount: 5 });

  const result = await creditDirectReferralCommission({
    traderUser: TRADER,
    transactionAmount: 100,
    eventType: "deposit_approved",
    eventId: "507f1f77bcf86cd799439013",
    eventStatus: "failed",
    deps,
  });

  assert.equal(result.credited, 0);
  assert.equal(result.reason, "non_qualifying_status");
  assert.equal(state.transactions.length, 0);
  assert.equal(state.incomeLogs.length, 0);
  assert.equal(state.referralIncomes.length, 0);
});

test("prevents duplicate direct commission on repeated callback for same event", async () => {
  const { deps, state } = buildDeps({ creditedAmount: 5 });
  const depositId = "507f1f77bcf86cd799439014";

  const first = await creditDirectReferralCommission({
    traderUser: TRADER,
    transactionAmount: 100,
    eventType: "deposit_approved",
    eventId: depositId,
    eventStatus: "approved",
    deps,
  });

  const second = await creditDirectReferralCommission({
    traderUser: TRADER,
    transactionAmount: 100,
    eventType: "deposit_approved",
    eventId: depositId,
    eventStatus: "approved",
    deps,
  });

  assert.equal(first.credited, 5);
  assert.equal(second.credited, 0);
  assert.equal(second.reason, "duplicate");
  assert.equal(state.transactions.length, 1);
  assert.equal(state.incomeLogs.length, 1);
  assert.equal(state.referralIncomes.length, 1);
});

test("direct referral passes working-user bypass to income cap service", async () => {
  const { state } = buildDeps({ creditedAmount: 5 });
  let capturedArgs = null;

  const deps = {
    logger: { info: () => {}, warn: () => {} },
    UserModel: {
      findById: async (id) => (String(id) === String(SPONSOR._id) ? SPONSOR : null),
      findOne: async (query) => (String(query?.userId || "").toUpperCase() === SPONSOR.userId ? SPONSOR : null),
    },
    ReferralIncomeModel: {
      findOne: async () => null,
      create: async (payload) => {
        state.referralIncomes.push(payload);
        return payload;
      },
    },
    applyIncomeWithCapFn: async (args) => {
      capturedArgs = args;
      return { creditedAmount: 5 };
    },
    addTransactionFn: async (...args) => {
      state.transactions.push(args);
    },
    logIncomeEventFn: async (payload) => {
      state.incomeLogs.push(payload);
    },
  };

  const result = await creditDirectReferralCommission({
    traderUser: TRADER,
    transactionAmount: 100,
    eventType: "deposit_approved",
    eventId: "507f1f77bcf86cd799439016",
    eventStatus: "approved",
    deps,
  });

  assert.equal(result.credited, 5);
  assert.equal(capturedArgs?.bypassWorkingUserRestriction, true);
  assert.equal(state.referralIncomes.length, 1);
});
