import mongoose from "mongoose";

const notificationBroadcastSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    type: {
      type: String,
      enum: ["announcement", "system", "admin"],
      default: "announcement",
      index: true,
    },
    audienceType: {
      type: String,
      enum: ["all", "selected", "active", "inactive"],
      required: true,
      index: true,
    },
    selectedUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    senderRole: {
      type: String,
      default: "admin",
      trim: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    recipientCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveredCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      index: true,
    },
    failureReason: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    completedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

notificationBroadcastSchema.index(
  { senderId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: "string", $ne: "" } } }
);
notificationBroadcastSchema.index({ createdAt: -1 });

const NotificationBroadcast = mongoose.model("NotificationBroadcast", notificationBroadcastSchema);

export default NotificationBroadcast;
