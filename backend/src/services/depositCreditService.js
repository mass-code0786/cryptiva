import mongoose from "mongoose";

import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { syncTeamBusinessForUserAndUplines } from "../controllers/referralController.js";
import { sendDepositSuccessNotification } from "./depositNotificationService.js";

const depositCreditDeps = {
  startSession: () => mongoose.startSession(),
  syncTeamBusinessForUserAndUplines,
  sendDepositSuccessNotification,
};

export const __setDepositCreditDeps = (overrides = {}) => {
  Object.assign(depositCreditDeps, overrides || {});
};

export const __resetDepositCreditDeps = () => {
  Object.assign(depositCreditDeps, {
    startSession: () => mongoose.startSession(),
    syncTeamBusinessForUserAndUplines,
    sendDepositSuccessNotification,
  });
};

const ensureWalletForSession = async (userId, session) => {
  let wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) {
    wallet = await Wallet.create([{ userId }], { session }).then((rows) => rows[0]);
  }
  return wallet;
};

const upsertDepositTransaction = async ({ session, deposit, source, status, metadata = {} }) => {
  const creditedAmount = Number(deposit.requestedCreditAmount || deposit.amount || 0);
  const baseMetadata = {
    depositId: deposit._id,
    requestedCreditAmount: creditedAmount,
    creditedAmount,
    expectedPayAmount: Number(deposit.expectedPayAmount || 0),
    expectedPayCurrency: String(deposit.expectedPayCurrency || deposit.payCurrency || "").toLowerCase(),
    gatewayFeeAmount: Number(deposit.gatewayFeeAmount || 0),
    gatewayFeeCurrency: String(deposit.gatewayFeeCurrency || "").toLowerCase(),
    feeHandlingMode: String(deposit.feeHandlingMode || "credit_exact_pay_fee_extra"),
    currency: deposit.currency,
    network: deposit.network,
    gateway: deposit.gateway,
    gatewayPaymentId: deposit.gatewayPaymentId,
    gatewayOrderId: deposit.gatewayOrderId,
    ...metadata,
  };

  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  if (session) {
    options.session = session;
  }

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
        metadata: baseMetadata,
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    options
  );
};

export const markDepositFailedOrExpired = async ({ deposit, mappedStatus, gatewayStatus, webhookPayload, txHash } = {}) => {
  const depositStatus = mappedStatus === "expired" ? "expired" : "failed";
  const normalizedGatewayStatus = String(gatewayStatus || "").toLowerCase();
  const nextTxHash = String(txHash || "").trim();

  const updated = await Deposit.findByIdAndUpdate(
    deposit._id,
    {
      $set: {
        status: depositStatus,
        gatewayStatus: normalizedGatewayStatus,
        webhookPayload: webhookPayload ?? null,
        ...(nextTxHash ? { txHash: nextTxHash } : {}),
      },
    },
    { new: true }
  );

  await upsertDepositTransaction({
    session: null,
    deposit: updated || deposit,
    source: `Gateway payment ${depositStatus}`,
    status: "failed",
    metadata: { gatewayStatus: normalizedGatewayStatus, txHash: nextTxHash },
  });

  return updated || deposit;
};

export const creditDepositOnce = async ({
  depositId,
  source = "Gateway payment confirmed",
  gatewayStatus = "",
  txHash = "",
  webhookPayload = null,
} = {}) => {
  const session = await depositCreditDeps.startSession();
  const normalizedGatewayStatus = String(gatewayStatus || "").toLowerCase();
  const normalizedTxHash = String(txHash || "").trim();
  let credited = false;
  let deposit = null;

  try {
    await session.withTransaction(async () => {
      const existing = await Deposit.findById(depositId).session(session);
      if (!existing) {
        throw new Error("Deposit not found");
      }

      const updated = await Deposit.findOneAndUpdate(
        {
          _id: existing._id,
          $or: [{ creditedAt: { $exists: false } }, { creditedAt: null }],
        },
        {
          $set: {
            status: "completed",
            creditedAt: new Date(),
            gatewayStatus: normalizedGatewayStatus || existing.gatewayStatus || "",
            webhookPayload: webhookPayload ?? existing.webhookPayload ?? null,
            ...(normalizedTxHash ? { txHash: normalizedTxHash } : {}),
          },
        },
        { new: true, session }
      );

      if (!updated) {
        deposit = await Deposit.findById(existing._id).session(session);
        await upsertDepositTransaction({
          session,
          deposit,
          source,
          status: "completed",
          metadata: { gatewayStatus: normalizedGatewayStatus, txHash: normalizedTxHash },
        });
        return;
      }

      const creditedAmount = Number(updated.requestedCreditAmount || updated.amount || 0);
      const wallet = await ensureWalletForSession(updated.userId, session);
      wallet.depositWallet = Number(wallet.depositWallet || 0) + creditedAmount;
      wallet.depositTotal = Number(wallet.depositTotal || 0) + creditedAmount;
      wallet.balance = Number(wallet.depositWallet || 0) + Number(wallet.withdrawalWallet || 0);
      await wallet.save({ session });

      await upsertDepositTransaction({
        session,
        deposit: updated,
        source,
        status: "completed",
        metadata: { gatewayStatus: normalizedGatewayStatus, txHash: normalizedTxHash },
      });

      deposit = updated;
      credited = true;
    });
  } finally {
    await session.endSession();
  }

  if (credited && deposit?.userId) {
    await Promise.all([
      depositCreditDeps.syncTeamBusinessForUserAndUplines(deposit.userId),
      depositCreditDeps.sendDepositSuccessNotification({
        userId: deposit.userId,
        amount: Number(deposit.requestedCreditAmount || deposit.amount || 0),
        depositId: deposit._id,
        gateway: deposit.gateway,
      }),
    ]);
  }

  return { credited, deposit };
};
