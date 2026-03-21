import mongoose from "mongoose";

import ActivityLog from "../models/ActivityLog.js";
import Notification from "../models/Notification.js";
import NotificationBroadcast from "../models/NotificationBroadcast.js";
import User from "../models/User.js";
import { ACTIVATION_MIN_TRADE_AMOUNT } from "./activationService.js";

export const NOTIFICATION_TYPES = ["announcement", "system", "admin"];
export const NOTIFICATION_AUDIENCES = ["all", "selected", "active", "inactive"];
const BROADCAST_INSERT_CHUNK_SIZE = 1000;

const normalizeObjectIdStrings = (values = []) => {
  const seen = new Set();
  const normalized = [];
  for (const raw of values) {
    const text = String(raw || "").trim();
    if (!mongoose.isValidObjectId(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    normalized.push(text);
  }
  return normalized;
};

const activationStatusPipeline = (isActive = true) => [
  { $match: { isAdmin: { $ne: true } } },
  {
    $lookup: {
      from: "trades",
      let: { uid: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$userId", "$$uid"] },
            status: { $in: ["active", "completed"] },
          },
        },
        { $group: { _id: null, totalInvestment: { $sum: "$amount" } } },
      ],
      as: "tradeAgg",
    },
  },
  {
    $addFields: {
      activationInvestment: { $ifNull: [{ $arrayElemAt: ["$tradeAgg.totalInvestment", 0] }, 0] },
      isActivated: {
        $or: [
          { $eq: ["$isActive", true] },
          { $eq: ["$packageActive", true] },
          { $eq: ["$mlmEligible", true] },
          { $eq: [{ $toLower: { $ifNull: ["$packageStatus", "inactive"] } }, "active"] },
          { $gte: [{ $ifNull: [{ $arrayElemAt: ["$tradeAgg.totalInvestment", 0] }, 0] }, ACTIVATION_MIN_TRADE_AMOUNT] },
        ],
      },
    },
  },
  { $match: { isActivated: isActive } },
  { $project: { _id: 1 } },
];

const getRecipientIdsByAudience = async ({ audienceType, selectedUserIds = [], UserModel = User }) => {
  if (audienceType === "all") {
    const users = await UserModel.find({ isAdmin: { $ne: true } }).select("_id").lean();
    return users.map((row) => String(row._id));
  }

  if (audienceType === "selected") {
    const normalized = normalizeObjectIdStrings(selectedUserIds);
    if (!normalized.length) {
      return [];
    }
    const users = await UserModel.find({ _id: { $in: normalized }, isAdmin: { $ne: true } }).select("_id").lean();
    return users.map((row) => String(row._id));
  }

  if (audienceType === "active" || audienceType === "inactive") {
    const rows = await UserModel.aggregate(activationStatusPipeline(audienceType === "active"));
    return rows.map((row) => String(row._id));
  }

  return [];
};

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const createActivityLog = async ({ adminId, action, reason = "", metadata = {} }) => {
  const now = new Date();
  await ActivityLog.create({
    adminId,
    type: "notification_broadcast",
    action,
    reason,
    metadata,
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 19),
  });
};

export const sendNotificationBroadcast = async ({
  senderId,
  senderRole = "admin",
  title,
  message,
  type = "announcement",
  audienceType,
  selectedUserIds = [],
  metadata = {},
  idempotencyKey = "",
  deps = {},
} = {}) => {
  const UserModel = deps.UserModel || User;
  const NotificationModel = deps.NotificationModel || Notification;
  const NotificationBroadcastModel = deps.NotificationBroadcastModel || NotificationBroadcast;
  const createActivityLogFn = deps.createActivityLogFn || createActivityLog;

  const normalizedTitle = String(title || "").trim();
  const normalizedMessage = String(message || "").trim();
  const normalizedType = String(type || "announcement").trim().toLowerCase();
  const normalizedAudienceType = String(audienceType || "").trim().toLowerCase();
  const normalizedIdempotencyKey = String(idempotencyKey || "").trim();
  const normalizedSelectedIds = normalizeObjectIdStrings(selectedUserIds);

  if (!mongoose.isValidObjectId(String(senderId || ""))) {
    throw new Error("Invalid senderId");
  }
  if (!normalizedTitle) {
    throw new Error("Title is required");
  }
  if (!normalizedMessage) {
    throw new Error("Message is required");
  }
  if (!NOTIFICATION_TYPES.includes(normalizedType)) {
    throw new Error("Invalid notification type");
  }
  if (!NOTIFICATION_AUDIENCES.includes(normalizedAudienceType)) {
    throw new Error("Invalid audience type");
  }
  if (normalizedAudienceType === "selected" && !normalizedSelectedIds.length) {
    throw new Error("At least one selected user is required");
  }

  if (normalizedIdempotencyKey) {
    const existing = await NotificationBroadcastModel.findOne({
      senderId,
      idempotencyKey: normalizedIdempotencyKey,
    });
    if (existing) {
      return { broadcast: existing, deduplicated: true, insertedCount: 0 };
    }
  }

  const recipientIds = await getRecipientIdsByAudience({
    audienceType: normalizedAudienceType,
    selectedUserIds: normalizedSelectedIds,
    UserModel,
  });
  if (!recipientIds.length) {
    throw new Error("No matching users found for selected audience");
  }

  const broadcast = await NotificationBroadcastModel.create({
    title: normalizedTitle,
    message: normalizedMessage,
    type: normalizedType,
    audienceType: normalizedAudienceType,
    selectedUserIds: normalizedAudienceType === "selected" ? normalizedSelectedIds : [],
    senderRole,
    senderId,
    idempotencyKey: normalizedIdempotencyKey,
    recipientCount: recipientIds.length,
    deliveredCount: 0,
    status: "processing",
    metadata,
  });

  let insertedCount = 0;
  try {
    for (const part of chunk(recipientIds, BROADCAST_INSERT_CHUNK_SIZE)) {
      const result = await NotificationModel.bulkWrite(
        part.map((userId) => ({
          updateOne: {
            filter: { broadcastId: broadcast._id, userId },
            update: {
              $setOnInsert: {
                userId,
                broadcastId: broadcast._id,
                title: normalizedTitle,
                message: normalizedMessage,
                type: normalizedType,
                audienceType: normalizedAudienceType,
                senderRole,
                senderId,
                isRead: false,
                readAt: null,
                metadata,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );

      insertedCount += Number(result?.upsertedCount || 0);
    }

    broadcast.deliveredCount = insertedCount;
    broadcast.status = "completed";
    broadcast.completedAt = new Date();
    await broadcast.save();

    await createActivityLogFn({
      adminId: senderId,
      action: "Notification broadcast sent",
      reason: `${normalizedAudienceType} audience`,
      metadata: {
        broadcastId: broadcast._id,
        audienceType: normalizedAudienceType,
        recipientCount: recipientIds.length,
        deliveredCount: insertedCount,
        type: normalizedType,
      },
    });

    return { broadcast, deduplicated: false, insertedCount };
  } catch (error) {
    broadcast.status = "failed";
    broadcast.failureReason = String(error?.message || "Failed to send broadcast");
    await broadcast.save();
    throw error;
  }
};

export const getActivationAudienceExpression = () => activationStatusPipeline(true);
