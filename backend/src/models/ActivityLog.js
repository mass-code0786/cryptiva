import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      default: "admin_action",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      default: null,
      min: 0,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    date: {
      type: String,
      default: "",
      index: true,
    },
    time: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

activityLogSchema.pre("validate", function syncDateTime(next) {
  const timestamp = this.createdAt || new Date();
  this.date = this.date || timestamp.toISOString().slice(0, 10);
  this.time = this.time || timestamp.toISOString().slice(11, 19);
  this.userId = this.userId || this.targetUserId || null;
  next();
});

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
