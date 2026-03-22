import crypto from "crypto";
import mongoose from "mongoose";

import { CRYPTO_GATEWAY_DEFAULT, DEPOSIT_AMOUNT_TOLERANCE_PERCENT, DEPOSIT_MIN_AMOUNT } from "../config/env.js";
import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { creditDepositOnce, markDepositFailedOrExpired } from "../services/depositCreditService.js";
import {
  LIVE_DEPOSIT_GATEWAYS,
  createGatewayInvoice,
  extractGatewayExpectedPaymentFields,
  extractNowPaymentsPaymentId,
  extractGatewayWebhookData,
  isGatewaySuccessFinalStatus,
  mapGatewayStatusToDepositStatus,
  resolveSupportedAsset,
  validateReceivedAmountAgainstExpected,
  verifyGatewayWebhookSignature,
} from "../services/liveDepositGatewayService.js";

const normalizeGateway = (value = "") => String(value || "").trim().toLowerCase() || CRYPTO_GATEWAY_DEFAULT;
const maskValue = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 6) return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
  return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
};
const toFiniteNumberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const toPositiveNumberOrNull = (value) => {
  const parsed = toFiniteNumberOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};
const depositControllerDeps = {
  createGatewayInvoice,
  extractGatewayExpectedPaymentFields,
  extractNowPaymentsPaymentId,
  verifyGatewayWebhookSignature,
  extractGatewayWebhookData,
  mapGatewayStatusToDepositStatus,
  isGatewaySuccessFinalStatus,
  validateReceivedAmountAgainstExpected,
  creditDepositOnce,
  markDepositFailedOrExpired,
};

export const __setDepositControllerDeps = (overrides = {}) => {
  Object.assign(depositControllerDeps, overrides || {});
};

export const __resetDepositControllerDeps = () => {
  Object.assign(depositControllerDeps, {
    createGatewayInvoice,
    extractGatewayExpectedPaymentFields,
    extractNowPaymentsPaymentId,
    verifyGatewayWebhookSignature,
    extractGatewayWebhookData,
    mapGatewayStatusToDepositStatus,
    isGatewaySuccessFinalStatus,
    validateReceivedAmountAgainstExpected,
    creditDepositOnce,
    markDepositFailedOrExpired,
  });
};

const upsertDepositTransaction = async ({ deposit, status, source, metadata = {} }) => {
  const creditedAmount = Number(deposit.requestedCreditAmount || deposit.amount || 0);
  const txMetadata = {
    depositId: deposit._id,
    requestedCreditAmount: creditedAmount,
    creditedAmount,
    expectedPayAmount: toPositiveNumberOrNull(deposit.expectedPayAmount),
    expectedPayCurrency: String(deposit.expectedPayCurrency || deposit.payCurrency || "").toLowerCase(),
    gatewayFeeAmount: toPositiveNumberOrNull(deposit.gatewayFeeAmount),
    gatewayFeeCurrency: String(deposit.gatewayFeeCurrency || "").toLowerCase(),
    feeHandlingMode: String(deposit.feeHandlingMode || "credit_exact_pay_fee_extra"),
    currency: deposit.currency,
    network: deposit.network,
    gateway: deposit.gateway,
    gatewayPaymentId: deposit.gatewayPaymentId || "",
    gatewayOrderId: deposit.gatewayOrderId || "",
    ...metadata,
  };

  await Transaction.findOneAndUpdate(
    { userId: deposit.userId, type: "deposit", "metadata.depositId": deposit._id },
    {
      $set: {
        userId: deposit.userId,
        type: "deposit",
        amount: creditedAmount,
        network: deposit.network || "BEP20",
        source,
        status,
        metadata: txMetadata,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const createDeposit = asyncHandler(async (req, res) => {
  const gateway = normalizeGateway(req.body.gateway || CRYPTO_GATEWAY_DEFAULT);
  const amount = Number(req.body.amount);
  const requestedCurrencyInput = req.body.currency || "USDT";
  const requestedNetworkInput = req.body.network || "BEP20";
  const { asset, currency, network } = resolveSupportedAsset({
    currency: requestedCurrencyInput,
    network: requestedNetworkInput,
  });

  console.log(
    `[deposit:create-live] request hit user=${String(req.user?._id || "unknown")} gateway=${gateway} amount=${String(
      req.body.amount
    )} currency=${String(requestedCurrencyInput)} network=${String(requestedNetworkInput)}`
  );

  try {
    const isAmountValid = Number.isFinite(amount) && amount >= DEPOSIT_MIN_AMOUNT;
    const isGatewayValid = LIVE_DEPOSIT_GATEWAYS.includes(gateway);
    const isAssetValid = Boolean(asset);
    console.log(
      `[deposit:create-live] validation result amountValid=${isAmountValid} gatewayValid=${isGatewayValid} assetValid=${isAssetValid}`
    );

    if (!isAmountValid) {
      throw new ApiError(400, `Minimum deposit is $${DEPOSIT_MIN_AMOUNT}`);
    }
    if (!isGatewayValid) {
      throw new ApiError(400, `Unsupported gateway. Allowed: ${LIVE_DEPOSIT_GATEWAYS.join(", ")}`);
    }
    if (!isAssetValid) {
      throw new ApiError(400, `Unsupported live deposit combination: ${currency} ${network}. Supported: USDT BSC (BEP20)`);
    }

    // Reliability fix:
    // We create the gateway order first and only persist a local deposit after
    // a valid gatewayPaymentId is present. This prevents empty-string ids from
    // ever entering the unique (gateway, gatewayPaymentId) index.
    const provisionalOrderId = crypto.randomUUID();
    console.log(`[deposit:create-live] mapped pay_currency=${String(asset.payCurrency || "")} order=${maskValue(provisionalOrderId)}`);

    const invoice = await depositControllerDeps.createGatewayInvoice({
      gateway,
      amount,
      orderId: provisionalOrderId,
      description: `Cryptiva deposit ${provisionalOrderId}`,
      payCurrency: asset.payCurrency,
    });

    const gatewayPaymentId = depositControllerDeps.extractNowPaymentsPaymentId(invoice);
    const gatewayStatus = String(invoice?.payment_status || invoice?.status || "waiting").toLowerCase();
    const gatewayOrderId = String(invoice?.order_id || provisionalOrderId).trim();
    console.log(
      `[deposit:create-live] gateway response paymentId=${maskValue(gatewayPaymentId)} orderId=${maskValue(
        gatewayOrderId
      )} status=${gatewayStatus} payCurrency=${String(invoice?.pay_currency || "")} hasPaymentUrl=${Boolean(
        invoice?.invoice_url || invoice?.payment_url
      )} hasPayAddress=${Boolean(invoice?.pay_address || invoice?.payin_address)}`
    );

    if (!gatewayPaymentId) {
      // Safe, explicit upstream-failure contract used by ops/support.
      throw new ApiError(502, "Gateway did not return a valid payment ID");
    }

    const paymentUrl = String(invoice?.invoice_url || invoice?.payment_url || "").trim();
    const payAddress = String(invoice?.pay_address || invoice?.payin_address || "").trim();
    const qrData = paymentUrl || payAddress || "";
    const gatewayAmountFields = depositControllerDeps.extractGatewayExpectedPaymentFields({
      gateway,
      payload: invoice,
      requestedCreditAmount: amount,
    });
    const requestedCreditAmount = Number(amount);
    const expectedPayAmount = toPositiveNumberOrNull(gatewayAmountFields.expectedPayAmount);
    const expectedPayCurrency = String(gatewayAmountFields.expectedPayCurrency || invoice?.pay_currency || asset.payCurrency || "").toLowerCase();

    const deposit = await Deposit.create({
      userId: req.user._id,
      amount,
      requestedCreditAmount,
      expectedPayAmount,
      expectedPayCurrency,
      gatewayFeeAmount: gatewayAmountFields.gatewayFeeAmount,
      gatewayFeeCurrency: String(gatewayAmountFields.gatewayFeeCurrency || "").toLowerCase(),
      payableAmountDisplay: String(gatewayAmountFields.payableAmountDisplay || "").trim(),
      feeHandlingMode: String(gatewayAmountFields.feeHandlingMode || "credit_exact_pay_fee_extra"),
      currency,
      network,
      status: "pending",
      gateway,
      gatewayStatus,
      gatewayOrderId,
      gatewayPaymentId,
      paymentUrl,
      payAddress,
      qrData,
      payCurrency: String(invoice?.pay_currency || asset.payCurrency || "").toLowerCase(),
      payment: {
        payment_id: gatewayPaymentId,
        payment_url: paymentUrl,
        pay_address: payAddress,
        qr_code_url: qrData,
      },
    });

    await upsertDepositTransaction({
      deposit,
      status: "pending",
      source: "Awaiting live crypto payment",
      metadata: {
        gatewayStatus,
        requestedCreditAmount,
        expectedPayAmount,
        expectedPayCurrency,
        gatewayFeeAmount: toPositiveNumberOrNull(deposit.gatewayFeeAmount),
        gatewayFeeCurrency: String(deposit.gatewayFeeCurrency || "").toLowerCase(),
      },
    });

    return res.status(201).json({
      message: "Live deposit order created",
      deposit,
      paymentUrl: deposit.paymentUrl,
      payAddress: deposit.payAddress,
      qrData: deposit.qrData,
      requestedCreditAmount: toPositiveNumberOrNull(deposit.requestedCreditAmount) ?? Number(deposit.amount || 0),
      expectedPayAmount: toPositiveNumberOrNull(deposit.expectedPayAmount),
      expectedPayCurrency: String(deposit.expectedPayCurrency || deposit.payCurrency || "").toLowerCase(),
      gatewayFeeAmount: toPositiveNumberOrNull(deposit.gatewayFeeAmount),
      gatewayFeeCurrency: String(deposit.gatewayFeeCurrency || "").toLowerCase(),
      feeHandlingMode: String(deposit.feeHandlingMode || "credit_exact_pay_fee_extra"),
      status: deposit.status,
    });
  } catch (error) {
    console.error("[deposit:create-live] error", {
      message: String(error?.message || error),
      stack: error?.stack || "",
      userId: String(req.user?._id || ""),
      gateway,
      amount: String(req.body?.amount ?? ""),
      currency: String(requestedCurrencyInput || ""),
      network: String(requestedNetworkInput || ""),
    });

    if (error instanceof ApiError && Number(error.statusCode || 500) < 500) {
      throw error;
    }

    const safeDetail = String(error?.message || "Unknown error");
    return res.status(500).json({
      message: "Unable to create live payment order",
      detail: safeDetail,
    });
  }
});

export const createLiveDeposit = createDeposit;

export const listDepositHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { userId: req.user._id };
  const [items, total] = await Promise.all([
    Deposit.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Deposit.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getDepositStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(404, "Deposit not found");
  }

  const deposit = await Deposit.findOne({ _id: req.params.id, userId: req.user._id });
  if (!deposit) {
    throw new ApiError(404, "Deposit not found");
  }

  const transaction = await Transaction.findOne({
    userId: req.user._id,
    type: "deposit",
    "metadata.depositId": deposit._id,
  }).sort({ createdAt: -1 });

  res.json({
    depositId: deposit._id,
    amount: deposit.amount,
    requestedCreditAmount: toPositiveNumberOrNull(deposit.requestedCreditAmount) ?? Number(deposit.amount || 0),
    expectedPayAmount: toPositiveNumberOrNull(deposit.expectedPayAmount),
    expectedPayCurrency: String(deposit.expectedPayCurrency || deposit.payCurrency || "").toLowerCase(),
    gatewayFeeAmount: toPositiveNumberOrNull(deposit.gatewayFeeAmount),
    gatewayFeeCurrency: String(deposit.gatewayFeeCurrency || "").toLowerCase(),
    payableAmountDisplay: String(deposit.payableAmountDisplay || "").trim(),
    feeHandlingMode: String(deposit.feeHandlingMode || "credit_exact_pay_fee_extra"),
    currency: deposit.currency,
    network: deposit.network,
    gateway: deposit.gateway,
    gatewayOrderId: deposit.gatewayOrderId,
    gatewayPaymentId: deposit.gatewayPaymentId,
    gatewayStatus: deposit.gatewayStatus,
    payCurrency: deposit.payCurrency,
    paymentUrl: deposit.paymentUrl || deposit.payment?.payment_url || "",
    payAddress: deposit.payAddress || deposit.payment?.pay_address || "",
    qrData: deposit.qrData || deposit.payment?.qr_code_url || "",
    txHash: deposit.txHash,
    creditedAt: deposit.creditedAt,
    depositStatus: deposit.status,
    transactionStatus: transaction?.status || "pending",
    createdAt: deposit.createdAt,
    updatedAt: deposit.updatedAt,
  });
});

export const handleDepositWebhook = asyncHandler(async (req, res) => {
  const gateway = normalizeGateway(req.params.gateway || req.body.gateway || CRYPTO_GATEWAY_DEFAULT);
  if (!LIVE_DEPOSIT_GATEWAYS.includes(gateway)) {
    throw new ApiError(404, "Unsupported webhook gateway");
  }

  const verified = depositControllerDeps.verifyGatewayWebhookSignature({
    gateway,
    rawBody: req.rawBody || "",
    payload: req.body || {},
    headers: req.headers || {},
  });
  if (!verified) {
    throw new ApiError(401, "Invalid webhook signature");
  }

  const data = depositControllerDeps.extractGatewayWebhookData({ gateway, payload: req.body || {} });
  if (!data) {
    throw new ApiError(400, "Unable to parse webhook payload");
  }

  const lookup = [{ gateway, gatewayPaymentId: data.gatewayPaymentId }, { gateway, gatewayOrderId: data.gatewayOrderId }];
  if (mongoose.isValidObjectId(data.gatewayOrderId)) {
    lookup.push({ _id: data.gatewayOrderId, gateway });
  }

  const deposit = await Deposit.findOne({ $or: lookup });
  if (!deposit) {
    return res.status(202).json({
      received: true,
      processed: false,
      reason: "Deposit not found",
    });
  }

  const mappedStatus = depositControllerDeps.mapGatewayStatusToDepositStatus(data.gatewayStatus);
  if (depositControllerDeps.isGatewaySuccessFinalStatus(data.gatewayStatus)) {
    const amountValidation = depositControllerDeps.validateReceivedAmountAgainstExpected({
      expectedPayAmount: Number(deposit.expectedPayAmount || deposit.amount || 0),
      expectedPayCurrency: String(deposit.expectedPayCurrency || deposit.payCurrency || "usd"),
      payload: req.body || {},
      tolerancePercent: DEPOSIT_AMOUNT_TOLERANCE_PERCENT,
    });

    if (!amountValidation.isWithinTolerance) {
      const nextTxHashMismatch = String(data.txHash || "").trim();
      deposit.status = "pending_review";
      deposit.gatewayStatus = String(data.gatewayStatus || "").toLowerCase();
      deposit.webhookPayload = req.body || null;
      if (data.gatewayPaymentId) deposit.gatewayPaymentId = data.gatewayPaymentId;
      if (data.gatewayOrderId) deposit.gatewayOrderId = data.gatewayOrderId;
      if (nextTxHashMismatch) deposit.txHash = nextTxHashMismatch;
      await deposit.save();

      await upsertDepositTransaction({
        deposit,
        status: "pending",
        source: `Payment amount ${amountValidation.reason}; pending manual review`,
        metadata: {
          gatewayStatus: deposit.gatewayStatus,
          amountValidation,
          txHash: nextTxHashMismatch,
        },
      });

      return res.status(202).json({
        received: true,
        processed: true,
        depositId: String(deposit._id),
        credited: false,
        status: deposit.status,
        amountValidation,
      });
    }

    const creditResult = await depositControllerDeps.creditDepositOnce({
      depositId: deposit._id,
      source: "Gateway payment confirmed",
      gatewayStatus: data.gatewayStatus,
      txHash: data.txHash,
      webhookPayload: req.body,
    });

    return res.json({
      received: true,
      processed: true,
      depositId: String(deposit._id),
      credited: creditResult.credited,
      status: creditResult.deposit?.status || "completed",
    });
  }

  if (mappedStatus === "failed" || mappedStatus === "expired") {
    const updated = await depositControllerDeps.markDepositFailedOrExpired({
      deposit,
      mappedStatus,
      gatewayStatus: data.gatewayStatus,
      txHash: data.txHash,
      webhookPayload: req.body,
    });

    return res.json({
      received: true,
      processed: true,
      depositId: String(updated._id),
      credited: false,
      status: updated.status,
    });
  }

  const nextTxHash = String(data.txHash || "").trim();
  deposit.gatewayStatus = String(data.gatewayStatus || "").toLowerCase();
  deposit.webhookPayload = req.body || null;
  if (data.gatewayPaymentId) {
    deposit.gatewayPaymentId = data.gatewayPaymentId;
  }
  if (data.gatewayOrderId) {
    deposit.gatewayOrderId = data.gatewayOrderId;
  }
  if (nextTxHash) {
    deposit.txHash = nextTxHash;
  }
  if (data.payAddress) {
    deposit.payAddress = data.payAddress;
  }
  if (data.payCurrency) {
    deposit.payCurrency = String(data.payCurrency || "").toLowerCase();
    if (!String(deposit.expectedPayCurrency || "").trim()) {
      deposit.expectedPayCurrency = String(data.payCurrency || "").toLowerCase();
    }
  }
  await deposit.save();

  await upsertDepositTransaction({
    deposit,
    status: "pending",
    source: "Awaiting final gateway confirmation",
    metadata: {
      gatewayStatus: deposit.gatewayStatus,
      txHash: nextTxHash,
    },
  });

  res.json({
    received: true,
    processed: true,
    depositId: String(deposit._id),
    credited: false,
    status: deposit.status,
  });
});
