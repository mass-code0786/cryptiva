import mongoose from "mongoose";

const salaryLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    weekStart: {
      type: Date,
      required: true,
      index: true,
    },
    weekEnd: {
      type: Date,
      required: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    time: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

salaryLogSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

const SalaryLog = mongoose.model("SalaryLog", salaryLogSchema, "salaryLogs");

export default SalaryLog;
