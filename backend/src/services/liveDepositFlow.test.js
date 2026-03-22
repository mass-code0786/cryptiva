import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetDepositControllerDeps,
  __setDepositControllerDeps,
  createLiveDeposit,
  getDepositStatus,
  handleDepositWebhook,
  listDepositHistory,
} from "../controllers/depositController.js";
import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import {
  __resetDepositCreditDeps,
  __setDepositCreditDeps,
  creditDepositOnce,
} from "./depositCreditService.js";

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

test("create live deposit order returns payment URL/address and pending status", async () => {
  const originalDepositCreate = Deposit.create;
  const originalTxFindOneAndUpdate = Transaction.findOneAndUpdate;
  const txCalls = [];
  const now = new Date("2026-03-22T10:00:00.000Z");

  try {
    Deposit.create = async (payload) => ({
      _id: "dep_live_1",
      createdAt: now,
      updatedAt: now,
      ...payload,
      save: async function save() {
        this.updatedAt = new Date("2026-03-22T10:01:00.000Z");
        return this;
      },
    });
    Transaction.findOneAndUpdate = async (...args) => {
      txCalls.push(args);
      return {};
    };
    __setDepositControllerDeps({
      createGatewayInvoice: async () => ({
        payment_id: "np_1001",
        payment_status: "waiting",
        order_id: "dep_live_1",
        invoice_url: "https://pay.example/invoice/np_1001",
        pay_address: "0xabc123",
        pay_currency: "usdtbep20",
      }),
    });

    const { statusCode, body } = await runHandler(createLiveDeposit, {
      user: { _id: "user_1" },
      body: { amount: 50, currency: "USDT", network: "BEP20" },
    });

    assert.equal(statusCode, 201);
    assert.equal(body.status, "pending");
    assert.equal(body.paymentUrl, "https://pay.example/invoice/np_1001");
    assert.equal(body.payAddress, "0xabc123");
    assert.equal(body.deposit.gatewayPaymentId, "np_1001");
    assert.equal(body.deposit.gateway, "nowpayments");
    assert.equal(txCalls.length >= 2, true);
  } finally {
    __resetDepositControllerDeps();
    Deposit.create = originalDepositCreate;
    Transaction.findOneAndUpdate = originalTxFindOneAndUpdate;
  }
});

test("successful webhook processes verified gateway callback and credits deposit", async () => {
  const originalDepositFindOne = Deposit.findOne;
  const originalTxFindOneAndUpdate = Transaction.findOneAndUpdate;
  let creditCalls = 0;

  try {
    Transaction.findOneAndUpdate = async () => ({});
    Deposit.findOne = async () => ({
      _id: "dep_web_1",
      userId: "user_1",
      amount: 100,
      status: "pending",
      gateway: "nowpayments",
      async save() {
        return this;
      },
    });
    __setDepositControllerDeps({
      verifyGatewayWebhookSignature: () => true,
      extractGatewayWebhookData: () => ({
        gatewayPaymentId: "np_1002",
        gatewayOrderId: "dep_web_1",
        gatewayStatus: "finished",
        txHash: "0xhash1",
      }),
      mapGatewayStatusToDepositStatus: () => "completed",
      isGatewaySuccessFinalStatus: () => true,
      validateReceivedAmountAgainstExpected: () => ({
        isWithinTolerance: true,
        reason: "within_tolerance",
      }),
      creditDepositOnce: async () => {
        creditCalls += 1;
        return { credited: true, deposit: { status: "completed" } };
      },
    });

    const { statusCode, body } = await runHandler(handleDepositWebhook, {
      params: { gateway: "nowpayments" },
      headers: { "x-nowpayments-sig": "valid" },
      rawBody: '{"payment_status":"finished"}',
      body: {},
    });

    assert.equal(statusCode, 200);
    assert.equal(body.received, true);
    assert.equal(body.credited, true);
    assert.equal(body.status, "completed");
    assert.equal(creditCalls, 1);
  } finally {
    __resetDepositControllerDeps();
    Deposit.findOne = originalDepositFindOne;
    Transaction.findOneAndUpdate = originalTxFindOneAndUpdate;
  }
});

test("duplicate success processing credits wallet only once", async () => {
  const originalDepositFindById = Deposit.findById;
  const originalDepositFindOneAndUpdate = Deposit.findOneAndUpdate;
  const originalWalletFindOne = Wallet.findOne;
  const originalWalletCreate = Wallet.create;
  const originalTxFindOneAndUpdate = Transaction.findOneAndUpdate;

  const depositState = {
    _id: "dep_dup_1",
    userId: "user_dup",
    amount: 100,
    currency: "USDT",
    network: "BEP20",
    gateway: "nowpayments",
    gatewayPaymentId: "np_dup",
    gatewayOrderId: "dep_dup_1",
    gatewayStatus: "finished",
    creditedAt: null,
    webhookPayload: null,
  };
  const walletState = {
    depositWallet: 10,
    withdrawalWallet: 5,
    depositTotal: 20,
    balance: 15,
    async save() {
      return this;
    },
  };
  const txCalls = [];

  try {
    __setDepositCreditDeps({
      startSession: async () => ({
        async withTransaction(fn) {
          await fn();
        },
        async endSession() {},
      }),
      syncTeamBusinessForUserAndUplines: async () => {},
      sendDepositSuccessNotification: async () => ({ inAppSent: true, emailSent: false }),
    });

    Deposit.findById = () => ({
      session: async () => ({ ...depositState }),
    });
    Deposit.findOneAndUpdate = async (_query, update) => {
      if (depositState.creditedAt) {
        return null;
      }
      Object.assign(depositState, update.$set || {});
      return { ...depositState };
    };
    Wallet.findOne = () => ({
      session: async () => walletState,
    });
    Wallet.create = async () => [walletState];
    Transaction.findOneAndUpdate = async (...args) => {
      txCalls.push(args);
      return {};
    };

    const first = await creditDepositOnce({
      depositId: depositState._id,
      gatewayStatus: "finished",
      txHash: "0xdup",
      webhookPayload: { payment_status: "finished" },
    });
    const second = await creditDepositOnce({
      depositId: depositState._id,
      gatewayStatus: "finished",
      txHash: "0xdup",
      webhookPayload: { payment_status: "finished" },
    });

    assert.equal(first.credited, true);
    assert.equal(second.credited, false);
    assert.equal(walletState.depositWallet, 110);
    assert.equal(walletState.depositTotal, 120);
    assert.equal(walletState.balance, 115);
    assert.equal(txCalls.length >= 2, true);
  } finally {
    __resetDepositCreditDeps();
    Deposit.findById = originalDepositFindById;
    Deposit.findOneAndUpdate = originalDepositFindOneAndUpdate;
    Wallet.findOne = originalWalletFindOne;
    Wallet.create = originalWalletCreate;
    Transaction.findOneAndUpdate = originalTxFindOneAndUpdate;
  }
});

test("failed or expired webhook does not trigger credit", async () => {
  const originalDepositFindOne = Deposit.findOne;
  let creditCalls = 0;
  let failCalls = 0;

  try {
    Deposit.findOne = async () => ({
      _id: "dep_fail_1",
      userId: "user_1",
      status: "pending",
      gateway: "nowpayments",
    });
    __setDepositControllerDeps({
      verifyGatewayWebhookSignature: () => true,
      extractGatewayWebhookData: () => ({
        gatewayPaymentId: "np_1003",
        gatewayOrderId: "dep_fail_1",
        gatewayStatus: "expired",
        txHash: "",
      }),
      mapGatewayStatusToDepositStatus: () => "expired",
      isGatewaySuccessFinalStatus: () => false,
      creditDepositOnce: async () => {
        creditCalls += 1;
        return { credited: true, deposit: { status: "completed" } };
      },
      markDepositFailedOrExpired: async () => {
        failCalls += 1;
        return { _id: "dep_fail_1", status: "expired" };
      },
    });

    const { body } = await runHandler(handleDepositWebhook, {
      params: { gateway: "nowpayments" },
      headers: { "x-nowpayments-sig": "valid" },
      rawBody: '{"payment_status":"expired"}',
      body: {},
    });

    assert.equal(body.received, true);
    assert.equal(body.credited, false);
    assert.equal(body.status, "expired");
    assert.equal(creditCalls, 0);
    assert.equal(failCalls, 1);
  } finally {
    __resetDepositControllerDeps();
    Deposit.findOne = originalDepositFindOne;
  }
});

test("underpaid or overpaid success webhook moves deposit to pending_review", async () => {
  const originalDepositFindOne = Deposit.findOne;
  const originalTxFindOneAndUpdate = Transaction.findOneAndUpdate;
  let creditCalls = 0;

  const depositDoc = {
    _id: "dep_review_1",
    userId: "user_1",
    amount: 100,
    status: "pending",
    gateway: "nowpayments",
    gatewayStatus: "",
    webhookPayload: null,
    async save() {
      return this;
    },
  };

  try {
    Transaction.findOneAndUpdate = async () => ({});
    Deposit.findOne = async () => depositDoc;
    __setDepositControllerDeps({
      verifyGatewayWebhookSignature: () => true,
      extractGatewayWebhookData: () => ({
        gatewayPaymentId: "np_1004",
        gatewayOrderId: "dep_review_1",
        gatewayStatus: "finished",
        txHash: "0xunder",
      }),
      mapGatewayStatusToDepositStatus: () => "completed",
      isGatewaySuccessFinalStatus: () => true,
      validateReceivedAmountAgainstExpected: () => ({
        isWithinTolerance: false,
        reason: "underpaid",
        expectedUsd: 100,
        receivedUsd: 90,
        tolerancePercent: 2,
        isUnderpaid: true,
        isOverpaid: false,
      }),
      creditDepositOnce: async () => {
        creditCalls += 1;
        return { credited: true, deposit: { status: "completed" } };
      },
    });

    const { statusCode, body } = await runHandler(handleDepositWebhook, {
      params: { gateway: "nowpayments" },
      headers: { "x-nowpayments-sig": "valid" },
      rawBody: '{"payment_status":"finished"}',
      body: {},
    });

    assert.equal(statusCode, 202);
    assert.equal(body.status, "pending_review");
    assert.equal(body.credited, false);
    assert.equal(body.amountValidation.reason, "underpaid");
    assert.equal(creditCalls, 0);
  } finally {
    __resetDepositControllerDeps();
    Deposit.findOne = originalDepositFindOne;
    Transaction.findOneAndUpdate = originalTxFindOneAndUpdate;
  }
});

test("deposit history includes pending and completed entries in flow visibility", async () => {
  const originalFind = Deposit.find;
  const originalCount = Deposit.countDocuments;

  const rows = [
    { _id: "dep_h_2", status: "completed", amount: 25 },
    { _id: "dep_h_1", status: "pending", amount: 25 },
  ];

  try {
    Deposit.find = () => ({
      sort: () => ({
        skip: () => ({
          limit: async () => rows,
        }),
      }),
    });
    Deposit.countDocuments = async () => rows.length;

    const { body } = await runHandler(listDepositHistory, {
      user: { _id: "user_history_1" },
      query: { page: 1, limit: 20 },
    });

    assert.equal(Array.isArray(body.items), true);
    assert.equal(body.items.length, 2);
    assert.deepEqual(
      body.items.map((item) => item.status),
      ["completed", "pending"]
    );
  } finally {
    Deposit.find = originalFind;
    Deposit.countDocuments = originalCount;
  }
});

test("deposit status endpoint exposes completed transaction entry after success", async () => {
  const originalDepositFindOne = Deposit.findOne;
  const originalTxFindOne = Transaction.findOne;

  try {
    Deposit.findOne = async () => ({
      _id: "dep_status_1",
      amount: 75,
      currency: "USDT",
      network: "BEP20",
      txHash: "0xstatus",
      status: "completed",
      gateway: "nowpayments",
      gatewayOrderId: "dep_status_1",
      gatewayPaymentId: "np_status_1",
      gatewayStatus: "finished",
      payCurrency: "usdtbep20",
      paymentUrl: "https://pay.example/invoice/np_status_1",
      payAddress: "0xstatusaddr",
      qrData: "https://pay.example/invoice/np_status_1",
      creditedAt: new Date("2026-03-22T11:00:00.000Z"),
      createdAt: new Date("2026-03-22T10:30:00.000Z"),
      updatedAt: new Date("2026-03-22T11:00:00.000Z"),
    });
    Transaction.findOne = () => ({
      sort: async () => ({ status: "completed" }),
    });

    const { body } = await runHandler(getDepositStatus, {
      params: { id: "507f1f77bcf86cd799439011" },
      user: { _id: "user_status_1" },
    });

    assert.equal(body.depositStatus, "completed");
    assert.equal(body.transactionStatus, "completed");
    assert.equal(body.gatewayStatus, "finished");
    assert.equal(body.paymentUrl, "https://pay.example/invoice/np_status_1");
  } finally {
    Deposit.findOne = originalDepositFindOne;
    Transaction.findOne = originalTxFindOne;
  }
});
