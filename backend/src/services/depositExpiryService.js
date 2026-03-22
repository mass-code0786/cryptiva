import { DEPOSIT_EXPIRY_INTERVAL_MS, DEPOSIT_PENDING_EXPIRY_HOURS } from "../config/env.js";
import Deposit from "../models/Deposit.js";
import Transaction from "../models/Transaction.js";

let expiryTimer = null;

export const expireStalePendingDeposits = async ({ deps = {} } = {}) => {
  const DepositModel = deps.DepositModel || Deposit;
  const TransactionModel = deps.TransactionModel || Transaction;
  const expiryHours = Number(deps.expiryHours ?? DEPOSIT_PENDING_EXPIRY_HOURS);
  const cutoff = new Date(Date.now() - Math.max(1, expiryHours) * 60 * 60 * 1000);

  const staleDeposits = await DepositModel.find({
    status: "pending",
    createdAt: { $lte: cutoff },
  }).select("_id userId amount currency network gateway gatewayPaymentId gatewayOrderId");

  if (!staleDeposits.length) {
    return { expiredCount: 0 };
  }

  const ids = staleDeposits.map((row) => row._id);
  await DepositModel.updateMany(
    { _id: { $in: ids }, status: "pending" },
    {
      $set: {
        status: "expired",
        gatewayStatus: "expired_timeout",
      },
    }
  );

  await Promise.all(
    staleDeposits.map((deposit) =>
      TransactionModel.findOneAndUpdate(
        { userId: deposit.userId, type: "deposit", "metadata.depositId": deposit._id },
        {
          $set: {
            userId: deposit.userId,
            type: "deposit",
            amount: Number(deposit.amount || 0),
            network: deposit.network || "BEP20",
            source: "Deposit expired after pending timeout",
            status: "failed",
            metadata: {
              depositId: deposit._id,
              currency: deposit.currency,
              network: deposit.network,
              gateway: deposit.gateway,
              gatewayPaymentId: deposit.gatewayPaymentId || "",
              gatewayOrderId: deposit.gatewayOrderId || "",
              gatewayStatus: "expired_timeout",
            },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  return { expiredCount: ids.length };
};

export const startDepositExpiryScheduler = ({ intervalMs = DEPOSIT_EXPIRY_INTERVAL_MS, logger = console } = {}) => {
  if (expiryTimer) {
    return;
  }
  const effectiveInterval = Number(intervalMs) > 0 ? Number(intervalMs) : DEPOSIT_EXPIRY_INTERVAL_MS;
  const tick = async () => {
    try {
      const result = await expireStalePendingDeposits();
      if (result.expiredCount > 0) {
        logger.log?.(`[DepositExpiry] expired ${result.expiredCount} pending deposits`);
      }
    } catch (error) {
      logger.warn?.(`[DepositExpiry] failed: ${error?.message || error}`);
    }
  };

  expiryTimer = setInterval(() => {
    tick().catch(() => {});
  }, effectiveInterval);
  tick().catch(() => {});
  logger.log?.(`[DepositExpiry] Scheduler started. Interval=${effectiveInterval}ms`);
};

export const stopDepositExpiryScheduler = ({ logger = console } = {}) => {
  if (!expiryTimer) return;
  clearInterval(expiryTimer);
  expiryTimer = null;
  logger.log?.("[DepositExpiry] Scheduler stopped.");
};

