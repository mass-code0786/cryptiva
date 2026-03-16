import mongoose from "mongoose";

const salaryPayoutSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rankName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    mainLegBusiness: {
      type: Number,
      required: true,
      min: 0,
    },
    otherLegBusiness: {
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
    status: {
      type: String,
      enum: ["credited"],
      default: "credited",
    },
  },
  {
    timestamps: true,
  }
);

salaryPayoutSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

const SalaryPayout = mongoose.model("SalaryPayout", salaryPayoutSchema);

export default SalaryPayout;
