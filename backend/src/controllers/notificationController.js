import mongoose from "mongoose";

import Notification from "../models/Notification.js";
import NotificationBroadcast from "../models/NotificationBroadcast.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { NOTIFICATION_AUDIENCES, NOTIFICATION_TYPES, sendNotificationBroadcast } from "../services/notificationService.js";

const getPagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const sendAdminNotification = asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  const type = String(req.body.type || "announcement").trim().toLowerCase();
  const audienceType = String(req.body.audienceType || "").trim().toLowerCase();
  const selectedUserIds = Array.isArray(req.body.selectedUserIds) ? req.body.selectedUserIds : [];
  const idempotencyKey = String(req.body.idempotencyKey || "").trim();

  if (!title) throw new ApiError(400, "Title is required");
  if (!message) throw new ApiError(400, "Message is required");
  if (!NOTIFICATION_TYPES.includes(type)) throw new ApiError(400, "Invalid notification type");
  if (!NOTIFICATION_AUDIENCES.includes(audienceType)) throw new ApiError(400, "Invalid audience type");
  if (audienceType === "selected" && selectedUserIds.length === 0) {
    throw new ApiError(400, "selectedUserIds is required for selected audience");
  }

  try {
    const result = await sendNotificationBroadcast({
      senderId: req.user._id,
      senderRole: req.user?.role || (req.user?.isAdmin ? "admin" : "user"),
      title,
      message,
      type,
      audienceType,
      selectedUserIds,
      idempotencyKey,
      metadata: {
        source: "admin_panel",
      },
    });

    res.status(201).json({
      message: result.deduplicated ? "Existing notification broadcast reused" : "Notification broadcast sent",
      deduplicated: Boolean(result.deduplicated),
      broadcast: result.broadcast,
      insertedCount: Number(result.insertedCount || 0),
    });
  } catch (error) {
    throw new ApiError(400, error?.message || "Unable to send notification");
  }
});

export const listAdminNotificationBroadcasts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const [items, total] = await Promise.all([
    NotificationBroadcast.find({})
      .populate("senderId", "userId name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    NotificationBroadcast.countDocuments({}),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const listMyNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";

  const query = { userId: req.user._id };
  if (unreadOnly) {
    query.isRead = false;
  }

  const [items, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getMyUnreadNotificationCount = asyncHandler(async (req, res) => {
  const unread = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  res.json({ unread });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const id = String(req.params.notificationId || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(404, "Notification not found");
  }

  const item = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    { new: true }
  );
  if (!item) {
    throw new ApiError(404, "Notification not found");
  }

  res.json({ item, message: "Notification marked as read" });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const now = new Date();
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: now } }
  );

  res.json({
    message: "All notifications marked as read",
    updatedCount: Number(result?.modifiedCount || 0),
  });
});
