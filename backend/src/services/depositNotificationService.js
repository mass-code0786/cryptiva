import mongoose from "mongoose";

import {
  DEPOSIT_EMAIL_WEBHOOK_URL,
  DEPOSIT_SUCCESS_EMAIL_ENABLED,
  DEPOSIT_SUCCESS_NOTIFICATION_ENABLED,
  SYSTEM_NOTIFICATION_SENDER_ID,
} from "../config/env.js";
import Notification from "../models/Notification.js";
import NotificationBroadcast from "../models/NotificationBroadcast.js";
import User from "../models/User.js";

const resolveSenderId = (userId) => {
  if (mongoose.isValidObjectId(SYSTEM_NOTIFICATION_SENDER_ID)) {
    return SYSTEM_NOTIFICATION_SENDER_ID;
  }
  return userId;
};

export const sendDepositSuccessNotification = async ({ userId, amount, depositId, gateway = "nowpayments", deps = {} } = {}) => {
  if (!DEPOSIT_SUCCESS_NOTIFICATION_ENABLED) {
    return { inAppSent: false, emailSent: false };
  }

  const NotificationModel = deps.NotificationModel || Notification;
  const NotificationBroadcastModel = deps.NotificationBroadcastModel || NotificationBroadcast;
  const UserModel = deps.UserModel || User;
  const fetchImpl = deps.fetchImpl || fetch;
  const logger = deps.logger || console;

  const title = "Deposit Completed";
  const message = `Your deposit of $${Number(amount || 0).toFixed(2)} has been credited successfully.`;
  const senderId = resolveSenderId(userId);
  const now = new Date();

  const broadcast = await NotificationBroadcastModel.create({
    title,
    message,
    type: "system",
    audienceType: "selected",
    selectedUserIds: [userId],
    senderRole: "system",
    senderId,
    recipientCount: 1,
    deliveredCount: 1,
    status: "completed",
    completedAt: now,
    metadata: {
      source: "deposit_success",
      depositId,
      gateway,
    },
  });

  await NotificationModel.create({
    userId,
    broadcastId: broadcast._id,
    title,
    message,
    type: "system",
    audienceType: "selected",
    senderRole: "system",
    senderId,
    isRead: false,
    readAt: null,
    metadata: {
      source: "deposit_success",
      depositId,
      gateway,
    },
  });

  let emailSent = false;
  if (DEPOSIT_SUCCESS_EMAIL_ENABLED && DEPOSIT_EMAIL_WEBHOOK_URL) {
    try {
      const user = await UserModel.findById(userId).select("email name userId");
      if (user?.email) {
        const response = await fetchImpl(DEPOSIT_EMAIL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "deposit_success",
            to: user.email,
            subject: title,
            name: user.name || user.userId || "User",
            amount: Number(amount || 0),
            depositId: String(depositId || ""),
            gateway,
            message,
          }),
        });
        emailSent = Boolean(response?.ok);
      }
    } catch (error) {
      logger.warn?.(`[deposit-notification] email webhook failed: ${error?.message || error}`);
    }
  }

  return { inAppSent: true, emailSent };
};

