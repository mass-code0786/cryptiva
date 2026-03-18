import test from "node:test";
import assert from "node:assert/strict";

import { backfillDirectReferralIncome } from "./directReferralBackfillService.js";

const chain = (rows) => ({
  sort: () => ({
    limit: (value) => (value > 0 ? rows.slice(0, value) : rows),
  }),
});

const createDepositModel = (rows) => ({
  find: (query) => {
    const filtered = rows.filter((row) => {
      const statusOk = query?.status?.$in ? query.status.$in.includes(row.status) : true;
      const amountOk = query?.amount?.$gt ? Number(row.amount) > Number(query.amount.$gt) : true;
      return statusOk && amountOk;
    });
    return chain(filtered);
  },
});

const createTradeModel = (rows = []) => ({
  find: (query) => {
    const filtered = rows.filter((row) => {
      const statusOk = query?.status?.$in ? query.status.$in.includes(row.status) : true;
      const amountOk = query?.amount?.$gt ? Number(row.amount) > Number(query.amount.$gt) : true;
      return statusOk && amountOk;
    });
    return chain(filtered);
  },
});

const createUserModel = (users) => ({
  findById: (id) => ({
    select: async () => users[String(id)] || null,
  }),
});

test("backfill credits missing direct referral commission", async () => {
  const deposits = [{ _id: "d1", userId: "u1", amount: 100, status: "approved", createdAt: new Date() }];
  const users = {
    u1: { _id: "u1", userId: "CTV-U1", email: "u1@demo.com", referredByUserId: "CTV-SP1" },
  };

  const summary = await backfillDirectReferralIncome({
    dryRun: false,
    sources: "deposits",
    deps: {
      DepositModel: createDepositModel(deposits),
      TradeModel: createTradeModel(),
      UserModel: createUserModel(users),
      logger: { info: () => {}, warn: () => {} },
      creditFn: async () => ({ skipped: false, credited: 5 }),
    },
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.creditedCount, 1);
  assert.equal(summary.creditedAmount, 5);
  assert.equal(summary.counters.credited, 1);
});

test("already-credited transaction is skipped", async () => {
  const deposits = [{ _id: "d2", userId: "u2", amount: 100, status: "approved", createdAt: new Date() }];
  const users = {
    u2: { _id: "u2", userId: "CTV-U2", email: "u2@demo.com", referredByUserId: "CTV-SP2" },
  };

  const summary = await backfillDirectReferralIncome({
    dryRun: false,
    sources: "deposits",
    deps: {
      DepositModel: createDepositModel(deposits),
      TradeModel: createTradeModel(),
      UserModel: createUserModel(users),
      logger: { info: () => {}, warn: () => {} },
      creditFn: async () => ({ skipped: true, reason: "duplicate", credited: 0 }),
    },
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.creditedCount, 0);
  assert.equal(summary.counters.skipped_duplicate, 1);
});

test("failed payment is skipped and not processed as qualifying event", async () => {
  const deposits = [
    { _id: "d3", userId: "u3", amount: 100, status: "failed", createdAt: new Date() },
    { _id: "d4", userId: "u3", amount: 50, status: "approved", createdAt: new Date() },
  ];
  const users = {
    u3: { _id: "u3", userId: "CTV-U3", email: "u3@demo.com", referredByUserId: "CTV-SP3" },
  };

  const seenEvents = [];
  await backfillDirectReferralIncome({
    dryRun: true,
    sources: "deposits",
    deps: {
      DepositModel: createDepositModel(deposits),
      TradeModel: createTradeModel(),
      UserModel: createUserModel(users),
      logger: { info: () => {}, warn: () => {} },
      creditFn: async ({ eventId }) => {
        seenEvents.push(String(eventId));
        return { skipped: false, credited: 2.5 };
      },
    },
  });

  assert.deepEqual(seenEvents, ["d4"]);
});

test("user without sponsor is skipped safely", async () => {
  const deposits = [{ _id: "d5", userId: "u5", amount: 100, status: "approved", createdAt: new Date() }];
  const users = {
    u5: { _id: "u5", userId: "CTV-U5", email: "u5@demo.com", referredByUserId: null, referredBy: null },
  };

  const summary = await backfillDirectReferralIncome({
    dryRun: false,
    sources: "deposits",
    deps: {
      DepositModel: createDepositModel(deposits),
      TradeModel: createTradeModel(),
      UserModel: createUserModel(users),
      logger: { info: () => {}, warn: () => {} },
      creditFn: async ({ traderUser }) => {
        if (!traderUser?.referredByUserId && !traderUser?.referredBy) {
          return { skipped: true, reason: "missing_sponsor", credited: 0 };
        }
        return { skipped: false, credited: 5 };
      },
    },
  });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.creditedCount, 0);
  assert.equal(summary.counters.skipped_missing_sponsor, 1);
});
