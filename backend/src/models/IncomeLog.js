import mongoose from "mongoose";

const incomeLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    incomeType: {
      type: String,
      enum: ["trading", "referral", "level", "salary"],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["trading", "referral", "level", "salary"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
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
  { timestamps: true }
);

incomeLogSchema.pre("validate", function syncDateTime(next) {
  const baseDate = this.recordedAt || this.createdAt || new Date();
  this.type = this.type || this.incomeType;
  this.date = this.date || baseDate.toISOString().slice(0, 10);
  this.time = this.time || baseDate.toISOString().slice(11, 19);
  next();
});

const IncomeLog = mongoose.model("IncomeLog", incomeLogSchema);

export default IncomeLog;
