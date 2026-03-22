import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetAdminDepositDeps,
  __setAdminDepositDeps,
  manualCreditDeposit,
  recheckDepositPaymentStatus,
} from "../controllers/adminController.js";
import ActivityLog from "../models/ActivityLog.js";
import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import { expireStalePendingDeposits } from "./depositExpiryService.js";

const runHandler = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
      },
    };
    handler(req, res, reject);
  });

test("pending deposits older than expiry window are marked expired", async () => {
  const staleRows = [
    {
      _id: "507f1f77bcf86cd799439120",
      userId: "507f1f77bcf86cd799439121",
      amount: 20,
      currency: "USDT",
      network: "BEP20",
      gateway: "nowpayments",
      gatewayPaymentId: "np_old_1",
      gatewayOrderId: "ord_old_1",
    },
  ];
  let updateManyCalls = 0;
  let txUpdates = 0;

  const result = await expireStalePendingDeposits({
    deps: {
      expiryHours: 2,
      DepositModel: {
        find: () => ({
          select: async () => staleRows,
        }),
        updateMany: async () => {
          updateManyCalls += 1;
          return { modifiedCount: 1 };
        },
      },
      TransactionModel: {
        findOneAndUpdate: async () => {
          txUpdates += 1;
          return {};
        },
      },
    },
  });

  assert.equal(result.expiredCount, 1);
  assert.equal(updateManyCalls, 1);
  assert.equal(txUpdates, 1);
});

test("admin recheck underpaid deposit moves status to pending_review", async () => {
  const originalDepositFindById = Deposit.findById;
  const originalTxFindOneAndUpdate = Transaction.findOneAndUpdate;
  const originalActivityCreate = ActivityLog.create;

  const depositDoc = {
    _id: "507f1f77bcf86cd799439130",
    userId: "507f1f77bcf86cd799439131",
    amount: 100,
    currency: "USDT",
    network: "BEP20",
    status: "pending",
    gateway: "nowpayments",
    gatewayPaymentId: "np_u1",
    gatewayOrderId: "ord_u1",
    gatewayStatus: "waiting",
    webhookPayload: null,
    async save() {
      return this;
    },
  };

  try {
    Deposit.findById = async () => depositDoc;
    Transaction.findOneAndUpdate = async () => ({});
    ActivityLog.create = async () => ({});
    __setAdminDepositDeps({
      getGatewayPaymentStatus: async () => ({
        payment_id: "np_u1",
        order_id: "ord_u1",
        payment_status: "finished",
      }),
      extractGatewayWebhookData: () => ({
        gatewayPaymentId: "np_u1",
        gatewayOrderId: "ord_u1",
        gatewayStatus: "finished",
        txHash: "0xunder1",
      }),
      mapGatewayStatusToDepositStatus: () => "completed",
      isGatewaySuccessFinalStatus: () => true,
      validateReceivedAmountAgainstExpected: () => ({
        isWithinTolerance: false,
        reason: "underpaid",
        expectedUsd: 100,
        receivedUsd: 94,
      }),
      creditDepositOnce: async () => ({ credited: true, deposit: { status: "completed" } }),
    });

    const { body } = await runHandler(recheckDepositPaymentStatus, {
      params: { depositId: "507f1f77bcf86cd799439130" },
      user: { _id: "507f1f77bcf86cd799439132" },
      body: {},
    });

    assert.equal(depositDoc.status, "pending_review");
    assert.equal(body.deposit.status, "pending_review");
  } finally {
    __resetAdminDepositDeps();
    Deposit.findById = originalDepositFindById;
    Transaction.findOneAndUpdate = originalTxFindOneAndUpdate;
    ActivityLog.create = originalActivityCreate;
  }
});

test("admin manual credit endpoint performs auditable credit action", async () => {
  const originalDepositFindById = Deposit.findById;
  const originalActivityCreate = ActivityLog.create;
  let creditCalls = 0;

  try {
    Deposit.findById = async () => ({
      _id: "507f1f77bcf86cd799439140",
      userId: "507f1f77bcf86cd799439141",
      amount: 150,
      gatewayStatus: "manual",
      txHash: "",
      webhookPayload: null,
    });
    ActivityLog.create = async () => ({});
    __setAdminDepositDeps({
      creditDepositOnce: async () => {
        creditCalls += 1;
        return { credited: true, deposit: { _id: "507f1f77bcf86cd799439140", status: "completed" } };
      },
    });

    const { body } = await runHandler(manualCreditDeposit, {
      params: { depositId: "507f1f77bcf86cd799439140" },
      user: { _id: "507f1f77bcf86cd799439142" },
      body: { reason: "Verified manually" },
    });

    assert.equal(creditCalls, 1);
    assert.equal(body.credited, true);
    assert.equal(String(body.deposit._id), "507f1f77bcf86cd799439140");
  } finally {
    __resetAdminDepositDeps();
    Deposit.findById = originalDepositFindById;
    ActivityLog.create = originalActivityCreate;
  }
});

