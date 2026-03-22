import mongoose from "mongoose";

import { CRYPTO_GATEWAY_DEFAULT, DEPOSIT_AMOUNT_TOLERANCE_PERCENT, DEPOSIT_MIN_AMOUNT } from "../config/env.js";
import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { creditDepositOnce, markDepositFailedOrExpired } from "../services/depositCreditService.js";
import {
  LIVE_DEPOSIT_GATEWAYS,
  createGatewayInvoice,
  extractGatewayWebhookData,
  isGatewaySuccessFinalStatus,
  mapGatewayStatusToDepositStatus,
  resolveSupportedAsset,
  validateReceivedAmountAgainstExpected,
  verifyGatewayWebhookSignature,
} from "../services/liveDepositGatewayService.js";

const normalizeGateway = (value = "") => String(value || "").trim().toLowerCase() || CRYPTO_GATEWAY_DEFAULT;
const depositControllerDeps = {
  createGatewayInvoice,
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
  const txMetadata = {
    depositId: deposit._id,
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
        amount: Number(deposit.amount || 0),
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
  const { asset, currency, network } = resolveSupportedAsset({
    currency: req.body.currency || "USDT",
    network: req.body.network || "BEP20",
  });

  if (!Number.isFinite(amount) || amount < DEPOSIT_MIN_AMOUNT) {
    throw new ApiError(400, `Minimum deposit is $${DEPOSIT_MIN_AMOUNT}`);
  }
  if (!LIVE_DEPOSIT_GATEWAYS.includes(gateway)) {
    throw new ApiError(400, `Unsupported gateway. Allowed: ${LIVE_DEPOSIT_GATEWAYS.join(", ")}`);
  }
  if (!asset) {
    throw new ApiError(400, "Only USDT BEP20 live deposits are currently supported");
  }

  const deposit = await Deposit.create({
    userId: req.user._id,
    amount,
    currency,
    network,
    status: "pending",
    gateway,
    gatewayStatus: "creating",
    payCurrency: asset.payCurrency,
  });

  await upsertDepositTransaction({
    deposit,
    status: "pending",
    source: "Live deposit request created",
    metadata: {
      gatewayStatus: "creating",
    },
  });

  const gatewayOrderId = String(deposit._id);
  try {
    const invoice = await depositControllerDeps.createGatewayInvoice({
      gateway,
      amount,
      orderId: gatewayOrderId,
      description: `Cryptiva deposit ${gatewayOrderId}`,
      payCurrency: asset.payCurrency,
    });

    const gatewayPaymentId = String(invoice?.payment_id || invoice?.id || "").trim();
    const paymentUrl = String(invoice?.invoice_url || invoice?.payment_url || "").trim();
    const payAddress = String(invoice?.pay_address || invoice?.payin_address || "").trim();
    const qrData = paymentUrl || payAddress || "";
    const gatewayStatus = String(invoice?.payment_status || invoice?.status || "waiting").toLowerCase();

    deposit.gatewayOrderId = String(invoice?.order_id || gatewayOrderId);
    deposit.gatewayPaymentId = gatewayPaymentId;
    deposit.gatewayStatus = gatewayStatus;
    deposit.paymentUrl = paymentUrl;
    deposit.payAddress = payAddress;
    deposit.qrData = qrData;
    deposit.payCurrency = String(invoice?.pay_currency || asset.payCurrency || "").toLowerCase();
    deposit.payment = {
      payment_id: gatewayPaymentId,
      payment_url: paymentUrl,
      pay_address: payAddress,
      qr_code_url: qrData,
    };
    await deposit.save();

    await upsertDepositTransaction({
      deposit,
      status: "pending",
      source: "Awaiting live crypto payment",
      metadata: {
        gatewayStatus,
      },
    });

    return res.status(201).json({
      message: "Live deposit order created",
      deposit,
      paymentUrl: deposit.paymentUrl,
      payAddress: deposit.payAddress,
      qrData: deposit.qrData,
      status: deposit.status,
    });
  } catch (error) {
    deposit.status = "failed";
    deposit.gatewayStatus = "create_failed";
    deposit.webhookPayload = { error: String(error?.message || "Gateway order creation failed") };
    await deposit.save();

    await upsertDepositTransaction({
      deposit,
      status: "failed",
      source: "Live deposit order creation failed",
      metadata: {
        gatewayStatus: "create_failed",
      },
    });

    throw new ApiError(502, `Unable to create live payment order: ${String(error?.message || "Gateway error")}`);
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
      expectedUsdAmount: deposit.amount,
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
