import crypto from "crypto";

import {
  DEPOSIT_AMOUNT_TOLERANCE_PERCENT,
  NOWPAYMENTS_API_BASE_URL,
  NOWPAYMENTS_API_KEY,
  NOWPAYMENTS_IPN_SECRET,
  NOWPAYMENTS_IPN_URL,
} from "../config/env.js";

export const LIVE_DEPOSIT_GATEWAYS = ["nowpayments"];
export const SUPPORTED_LIVE_ASSETS = [{ currency: "USDT", network: "BSC", payCurrency: "usdtbsc" }];

const normalizeText = (value = "") => String(value || "").trim();
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const normalizeAmount = (value) => {
  const num = toNumber(value);
  if (!(num >= 0)) return null;
  return Number(num.toFixed(8));
};
const normalizeNetwork = (value = "") => {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "BEP20") return "BSC";
  return normalized;
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getHeader = (headers = {}, key = "") => {
  const lookup = Object.keys(headers || {}).find((name) => name.toLowerCase() === String(key).toLowerCase());
  return lookup ? headers[lookup] : "";
};

export const resolveSupportedAsset = ({ currency = "USDT", network = "BEP20" } = {}) => {
  const normalizedCurrency = normalizeText(currency).toUpperCase();
  const normalizedNetwork = normalizeNetwork(network);
  const asset = SUPPORTED_LIVE_ASSETS.find(
    (entry) => entry.currency === normalizedCurrency && entry.network === normalizedNetwork
  );
  return {
    asset: asset || null,
    currency: normalizedCurrency,
    network: normalizedNetwork,
  };
};

const toNowPaymentsInvoicePayload = ({ amount, orderId, description, payCurrency = "usdtbsc" }) => ({
  price_amount: Number(amount),
  price_currency: "usd",
  pay_currency: payCurrency,
  order_id: String(orderId),
  order_description: String(description || `Deposit ${orderId}`),
  ipn_callback_url: NOWPAYMENTS_IPN_URL || undefined,
});

export const createNowPaymentsInvoice = async ({ amount, orderId, description, payCurrency = "usdtbsc", deps = {} } = {}) => {
  const apiKey = String(deps.apiKey || NOWPAYMENTS_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is not configured");
  }

  const fetchImpl = deps.fetchImpl || fetch;
  console.log(
    `[live-deposit] creating nowpayments invoice: order_id=${String(orderId)} price_amount=${Number(amount)} pay_currency=${String(
      payCurrency
    )}`
  );
  const response = await fetchImpl(`${NOWPAYMENTS_API_BASE_URL.replace(/\/+$/, "")}/v1/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(toNowPaymentsInvoicePayload({ amount, orderId, description, payCurrency })),
  });

  const raw = await response.text();
  const parsed = safeJsonParse(raw);

  if (!response.ok) {
    throw new Error(parsed?.message || parsed?.error || `Gateway create payment failed with status ${response.status}`);
  }

  return parsed || {};
};

export const createGatewayInvoice = async ({ gateway, amount, orderId, description, payCurrency, deps = {} } = {}) => {
  const normalizedGateway = normalizeText(gateway).toLowerCase();
  if (normalizedGateway !== "nowpayments") {
    throw new Error(`Unsupported gateway: ${normalizedGateway}`);
  }
  return createNowPaymentsInvoice({ amount, orderId, description, payCurrency, deps });
};

export const extractNowPaymentsPaymentId = (payload = {}) => {
  // NOWPayments payloads vary across endpoints/releases; keep extraction tolerant.
  // Returning "" here intentionally fails create-live before any DB insert.
  const candidates = [payload?.payment_id, payload?.id, payload?.paymentId, payload?.data?.payment_id, payload?.data?.id];
  const resolved = candidates.map((entry) => normalizeText(entry)).find((entry) => Boolean(entry));
  if (!resolved || ["null", "undefined"].includes(resolved.toLowerCase())) {
    return "";
  }
  return resolved;
};

export const getNowPaymentsPaymentStatus = async ({ paymentId, orderId, deps = {} } = {}) => {
  if (!NOWPAYMENTS_API_KEY) {
    throw new Error("NOWPAYMENTS_API_KEY is not configured");
  }
  const normalizedPaymentId = normalizeText(paymentId);
  const normalizedOrderId = normalizeText(orderId);
  const fetchImpl = deps.fetchImpl || fetch;
  let endpoint = "";

  if (normalizedPaymentId) {
    endpoint = `${NOWPAYMENTS_API_BASE_URL.replace(/\/+$/, "")}/v1/payment/${encodeURIComponent(normalizedPaymentId)}`;
  } else if (normalizedOrderId) {
    endpoint = `${NOWPAYMENTS_API_BASE_URL.replace(/\/+$/, "")}/v1/payment?order_id=${encodeURIComponent(normalizedOrderId)}`;
  } else {
    throw new Error("paymentId or orderId is required for gateway status recheck");
  }

  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": NOWPAYMENTS_API_KEY,
    },
  });

  const raw = await response.text();
  const parsed = safeJsonParse(raw);
  if (!response.ok) {
    throw new Error(parsed?.message || parsed?.error || `Gateway status check failed with status ${response.status}`);
  }

  if (Array.isArray(parsed)) {
    return parsed[0] || null;
  }
  if (Array.isArray(parsed?.data)) {
    return parsed.data[0] || null;
  }
  if (Array.isArray(parsed?.result)) {
    return parsed.result[0] || null;
  }
  return parsed || null;
};

export const getGatewayPaymentStatus = async ({ gateway, paymentId, orderId, deps = {} } = {}) => {
  const normalizedGateway = normalizeText(gateway).toLowerCase();
  if (normalizedGateway !== "nowpayments") {
    throw new Error(`Unsupported gateway: ${normalizedGateway}`);
  }
  return getNowPaymentsPaymentStatus({ paymentId, orderId, deps });
};

export const verifyNowPaymentsWebhookSignature = ({ rawBody = "", payload, headers = {}, deps = {} } = {}) => {
  if (!NOWPAYMENTS_IPN_SECRET) {
    return false;
  }

  const signature = normalizeText(getHeader(headers, "x-nowpayments-sig"));
  if (!signature) {
    return false;
  }

  const digestPayload = normalizeText(rawBody) || JSON.stringify(payload || {});
  const hmacImpl = deps.hmacImpl || crypto.createHmac;
  const expected = hmacImpl("sha512", NOWPAYMENTS_IPN_SECRET).update(digestPayload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
};

export const verifyGatewayWebhookSignature = ({ gateway, rawBody, payload, headers, deps = {} } = {}) => {
  const normalizedGateway = normalizeText(gateway).toLowerCase();
  if (normalizedGateway === "nowpayments") {
    return verifyNowPaymentsWebhookSignature({ rawBody, payload, headers, deps });
  }
  return false;
};

export const normalizeGatewayStatus = (status = "") => normalizeText(status).toLowerCase();

export const mapGatewayStatusToDepositStatus = (status = "") => {
  const normalized = normalizeGatewayStatus(status);
  if (["finished", "confirmed"].includes(normalized)) {
    return "completed";
  }
  if (["failed", "expired", "refunded"].includes(normalized)) {
    return normalized === "expired" ? "expired" : "failed";
  }
  return "pending";
};

export const isGatewaySuccessFinalStatus = (status = "") => ["finished", "confirmed"].includes(normalizeGatewayStatus(status));

export const extractGatewayWebhookData = ({ gateway, payload = {} } = {}) => {
  const normalizedGateway = normalizeText(gateway).toLowerCase();
  if (normalizedGateway !== "nowpayments") {
    return null;
  }

  return {
    gatewayPaymentId: extractNowPaymentsPaymentId(payload),
    gatewayOrderId: normalizeText(payload.order_id),
    gatewayStatus: normalizeGatewayStatus(payload.payment_status || payload.status),
    txHash: normalizeText(payload.payin_hash || payload.txhash || payload.txHash),
    payAddress: normalizeText(payload.pay_address || payload.payin_address),
    payCurrency: normalizeText(payload.pay_currency),
  };
};

const normalizeCurrencyKey = (value = "") => normalizeText(value).toLowerCase();

const isSameCurrencyFamily = (left = "", right = "") => {
  const a = normalizeCurrencyKey(left);
  const b = normalizeCurrencyKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const usdLike = ["usd", "usdt", "usdtbsc"];
  return usdLike.includes(a) && usdLike.includes(b);
};

const pickFirstFinite = (values = []) => values.map(toNumber).find((entry) => Number.isFinite(entry));

const toDisplayAmount = (value) => {
  const numberValue = toNumber(value);
  if (!Number.isFinite(numberValue)) return "";
  return Number(numberValue.toFixed(8)).toString();
};

export const extractGatewayExpectedPaymentFields = ({ gateway, payload = {}, requestedCreditAmount = null } = {}) => {
  const normalizedGateway = normalizeText(gateway).toLowerCase();
  if (normalizedGateway !== "nowpayments") {
    return {
      expectedPayAmount: null,
      expectedPayCurrency: "",
      gatewayFeeAmount: null,
      gatewayFeeCurrency: "",
      payableAmountDisplay: "",
      feeHandlingMode: "credit_exact_pay_fee_extra",
    };
  }

  const expectedPayAmount = normalizeAmount(
    pickFirstFinite([payload?.pay_amount, payload?.outcome_amount, payload?.payin_amount, payload?.pay_amount_usd])
  );
  const expectedPayCurrency = normalizeCurrencyKey(payload?.pay_currency || payload?.outcome_currency || payload?.payin_currency);
  const requested = normalizeAmount(requestedCreditAmount ?? payload?.price_amount);
  const priceCurrency = normalizeCurrencyKey(payload?.price_currency || "usd");

  let gatewayFeeAmount = normalizeAmount(
    pickFirstFinite([
      payload?.network_fee,
      payload?.gateway_fee,
      payload?.fee_amount,
      payload?.fee?.amount,
      payload?.fee?.value,
    ])
  );
  let gatewayFeeCurrency = normalizeCurrencyKey(
    payload?.network_fee_currency || payload?.gateway_fee_currency || payload?.fee_currency || payload?.fee?.currency
  );

  if (!(gatewayFeeAmount >= 0) && Number.isFinite(expectedPayAmount) && Number.isFinite(requested)) {
    if (priceCurrency === "usd" && isSameCurrencyFamily(expectedPayCurrency || "usdtbsc", "usdtbsc")) {
      gatewayFeeAmount = normalizeAmount(expectedPayAmount - requested);
      if (!(gatewayFeeAmount >= 0)) {
        gatewayFeeAmount = null;
      } else {
        gatewayFeeCurrency = expectedPayCurrency || "usdtbsc";
      }
    }
  }

  const payableAmountDisplay =
    Number.isFinite(expectedPayAmount) && expectedPayCurrency
      ? `${toDisplayAmount(expectedPayAmount)} ${String(expectedPayCurrency).toUpperCase()}`
      : "";

  return {
    expectedPayAmount,
    expectedPayCurrency,
    gatewayFeeAmount,
    gatewayFeeCurrency,
    payableAmountDisplay,
    feeHandlingMode: "credit_exact_pay_fee_extra",
  };
};

export const validateReceivedAmountAgainstExpected = ({
  expectedPayAmount,
  expectedPayCurrency = "",
  expectedUsdAmount,
  payload = {},
  tolerancePercent = DEPOSIT_AMOUNT_TOLERANCE_PERCENT,
} = {}) => {
  const expected = toNumber(expectedPayAmount ?? expectedUsdAmount);
  const expectedCurrency = normalizeCurrencyKey(expectedPayCurrency || payload?.pay_currency || "usd");
  const tolerance = Math.max(0, toNumber(tolerancePercent) ?? DEPOSIT_AMOUNT_TOLERANCE_PERCENT);
  if (!(expected > 0)) {
    return {
      isWithinTolerance: false,
      reason: "invalid_expected_amount",
      expectedAmount: expected,
      expectedCurrency,
      receivedAmount: null,
      receivedCurrency: expectedCurrency || "",
      expectedUsd: expected,
      receivedUsd: null,
    };
  }

  const priceCurrency = normalizeCurrencyKey(payload?.price_currency);
  const outcomeCurrency = normalizeCurrencyKey(payload?.outcome_currency);
  const payCurrency = normalizeCurrencyKey(payload?.pay_currency);

  const receivedCandidates = [];
  const expectedIsUsdLike = isSameCurrencyFamily(expectedCurrency, "usd");
  const expectedIsPayCurrency = isSameCurrencyFamily(expectedCurrency, payCurrency);
  const expectedIsOutcomeCurrency = isSameCurrencyFamily(expectedCurrency, outcomeCurrency);
  const expectedIsPriceCurrency = isSameCurrencyFamily(expectedCurrency, priceCurrency);

  if (expectedIsPayCurrency || !expectedCurrency) {
    receivedCandidates.push(payload?.actually_paid, payload?.pay_amount, payload?.payin_amount);
  }
  if (expectedIsOutcomeCurrency || !expectedCurrency) {
    receivedCandidates.push(payload?.outcome_amount, payload?.outcome_amount_usd);
  }
  if (expectedIsPriceCurrency || expectedIsUsdLike || !expectedCurrency) {
    receivedCandidates.push(payload?.actually_paid_at_fiat, payload?.pay_amount_usd, payload?.received_amount_usd);
  }

  const received = pickFirstFinite(receivedCandidates);
  if (!(received > 0)) {
    return {
      isWithinTolerance: false,
      reason: "missing_received_amount_usd",
      expectedAmount: expected,
      expectedCurrency,
      receivedAmount: null,
      receivedCurrency: expectedCurrency || "",
      expectedUsd: expected,
      receivedUsd: null,
      tolerancePercent: tolerance,
    };
  }

  const lowerBound = expected * (1 - tolerance / 100);
  const upperBound = expected * (1 + tolerance / 100);
  const delta = Number((received - expected).toFixed(8));
  const deviationPercent = Number((((received - expected) / expected) * 100).toFixed(6));
  const isUnderpaid = received < lowerBound;
  const isOverpaid = received > upperBound;
  const isWithinTolerance = !isUnderpaid && !isOverpaid;

  return {
    expectedAmount: expected,
    expectedCurrency,
    receivedAmount: received,
    receivedCurrency: expectedCurrency || payCurrency || outcomeCurrency || priceCurrency || "",
    deltaAmount: delta,
    expectedUsd: expected,
    receivedUsd: received,
    deltaUsd: delta,
    deviationPercent,
    tolerancePercent: tolerance,
    lowerBound,
    upperBound,
    isUnderpaid,
    isOverpaid,
    isWithinTolerance,
    reason: isWithinTolerance ? "within_tolerance" : isUnderpaid ? "underpaid" : "overpaid",
  };
};
