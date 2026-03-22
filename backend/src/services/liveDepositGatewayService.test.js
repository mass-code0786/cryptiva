import assert from "node:assert/strict";
import test from "node:test";

import { createNowPaymentsInvoice, resolveSupportedAsset } from "./liveDepositGatewayService.js";

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
