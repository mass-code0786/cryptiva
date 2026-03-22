import assert from "node:assert/strict";
import test from "node:test";

import {
  createNowPaymentsInvoice,
  extractGatewayExpectedPaymentFields,
  resolveSupportedAsset,
  validateReceivedAmountAgainstExpected,
} from "./liveDepositGatewayService.js";

test("USDT + BEP20 resolves to BSC and pay_currency usdtbsc", () => {
  const resolved = resolveSupportedAsset({ currency: "USDT", network: "BEP20" });
  assert.equal(resolved.currency, "USDT");
  assert.equal(resolved.network, "BSC");
  assert.equal(resolved.asset?.payCurrency, "usdtbsc");
});

test("invalid mapping usdtbep20 is never sent in gateway payload", async () => {
  let capturedBody = "";

  await createNowPaymentsInvoice({
    amount: 25,
    orderId: "ord_1",
    description: "test",
    payCurrency: "usdtbsc",
    deps: {
      apiKey: "test-key",
      fetchImpl: async (_url, options = {}) => {
        capturedBody = String(options.body || "");
        return {
          ok: true,
          text: async () => JSON.stringify({ payment_id: "np_1" }),
        };
      },
    },
  });
  assert.equal(capturedBody.includes('"pay_currency":"usdtbep20"'), false);
  assert.equal(capturedBody.includes('"pay_currency":"usdtbsc"'), true);
});

test("extracts expected pay amount and fee for nowpayments invoice", () => {
  const result = extractGatewayExpectedPaymentFields({
    gateway: "nowpayments",
    requestedCreditAmount: 50,
    payload: {
      pay_amount: 50.8,
      pay_currency: "usdtbsc",
      price_amount: 50,
      price_currency: "usd",
    },
  });

  assert.equal(result.expectedPayAmount, 50.8);
  assert.equal(result.expectedPayCurrency, "usdtbsc");
  assert.equal(result.gatewayFeeAmount, 0.8);
  assert.equal(result.payableAmountDisplay, "50.8 USDTBSC");
});

test("null pay_amount does not crash and returns nullable fee/payable fields", () => {
  const result = extractGatewayExpectedPaymentFields({
    gateway: "nowpayments",
    requestedCreditAmount: 50,
    payload: {
      pay_amount: null,
      pay_currency: "usdtbsc",
      price_amount: 50,
      price_currency: "usd",
      fee_amount: null,
    },
  });

  assert.equal(result.expectedPayAmount, null);
  assert.equal(result.gatewayFeeAmount, null);
  assert.equal(result.payableAmountDisplay, null);
});

test("validates actually paid amount against expected payable amount", () => {
  const result = validateReceivedAmountAgainstExpected({
    expectedPayAmount: 50.8,
    expectedPayCurrency: "usdtbsc",
    payload: {
      pay_currency: "usdtbsc",
      pay_amount: 50.8,
      actually_paid: 50.8,
    },
    tolerancePercent: 0.1,
  });

  assert.equal(result.isWithinTolerance, true);
  assert.equal(result.reason, "within_tolerance");
  assert.equal(result.expectedAmount, 50.8);
  assert.equal(result.receivedAmount, 50.8);
});
