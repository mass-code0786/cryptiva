import crypto from "crypto";

import {
  DEPOSIT_AMOUNT_TOLERANCE_PERCENT,
  NOWPAYMENTS_API_BASE_URL,
  NOWPAYMENTS_API_KEY,
  NOWPAYMENTS_IPN_SECRET,
  NOWPAYMENTS_IPN_URL,
} from "../config/env.js";

export const LIVE_DEPOSIT_GATEWAYS = ["nowpayments"];
export const SUPPORTED_LIVE_ASSETS = [{ currency: "USDT", network: "BEP20", payCurrency: "usdtbep20" }];

const normalizeText = (value = "") => String(value || "").trim();
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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
  const normalizedNetwork = normalizeText(network).toUpperCase();
  const asset = SUPPORTED_LIVE_ASSETS.find(
    (entry) => entry.currency === normalizedCurrency && entry.network === normalizedNetwork
  );
  return {
    asset: asset || null,
    currency: normalizedCurrency,
    network: normalizedNetwork,
  };
};

const toNowPaymentsInvoicePayload = ({ amount, orderId, description, payCurrency = "usdtbep20" }) => ({
  price_amount: Number(amount),
  price_currency: "usd",
  pay_currency: payCurrency,
  order_id: String(orderId),
  order_description: String(description || `Deposit ${orderId}`),
  ipn_callback_url: NOWPAYMENTS_IPN_URL || undefined,
});

export const createNowPaymentsInvoice = async ({ amount, orderId, description, payCurrency = "usdtbep20", deps = {} } = {}) => {
  if (!NOWPAYMENTS_API_KEY) {
    throw new Error("NOWPAYMENTS_API_KEY is not configured");
  }

  const fetchImpl = deps.fetchImpl || fetch;
  const response = await fetchImpl(`${NOWPAYMENTS_API_BASE_URL.replace(/\/+$/, "")}/v1/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": NOWPAYMENTS_API_KEY,
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
    gatewayPaymentId: normalizeText(payload.payment_id),
    gatewayOrderId: normalizeText(payload.order_id),
    gatewayStatus: normalizeGatewayStatus(payload.payment_status || payload.status),
    txHash: normalizeText(payload.payin_hash || payload.txhash || payload.txHash),
    payAddress: normalizeText(payload.pay_address || payload.payin_address),
    payCurrency: normalizeText(payload.pay_currency),
  };
};

export const validateReceivedAmountAgainstExpected = ({ expectedUsdAmount, payload = {}, tolerancePercent = DEPOSIT_AMOUNT_TOLERANCE_PERCENT } = {}) => {
  const expected = toNumber(expectedUsdAmount);
  const tolerance = Math.max(0, toNumber(tolerancePercent) ?? DEPOSIT_AMOUNT_TOLERANCE_PERCENT);
  if (!(expected > 0)) {
    return { isWithinTolerance: false, reason: "invalid_expected_amount", expectedUsd: expected, receivedUsd: null };
  }

  const receivedCandidates = [
    payload?.actually_paid_at_fiat,
    payload?.pay_amount_usd,
    payload?.outcome_amount_usd,
    payload?.received_amount_usd,
  ];

  const priceCurrency = normalizeText(payload?.price_currency).toLowerCase();
  const outcomeCurrency = normalizeText(payload?.outcome_currency).toLowerCase();
  const payCurrency = normalizeText(payload?.pay_currency).toLowerCase();

  if (priceCurrency === "usd") {
    receivedCandidates.push(payload?.outcome_amount, payload?.actually_paid, payload?.pay_amount);
  } else if (outcomeCurrency === "usd") {
    receivedCandidates.push(payload?.outcome_amount);
  } else if (payCurrency === "usd" || payCurrency === "usdt" || payCurrency === "usdtbep20") {
    receivedCandidates.push(payload?.actually_paid, payload?.pay_amount);
  }

  const received = receivedCandidates.map(toNumber).find((entry) => Number.isFinite(entry));
  if (!(received > 0)) {
    return {
      isWithinTolerance: false,
      reason: "missing_received_amount_usd",
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
