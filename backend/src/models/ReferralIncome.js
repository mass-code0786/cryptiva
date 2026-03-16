import mongoose from "mongoose";

const referralIncomeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sourceUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    depositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposit",
      required: true,
      index: true,
    },
    incomeType: {
      type: String,
      enum: ["direct", "level"],
      required: true,
      index: true,
    },
    level: {
      type: Number,
      enum: [1, 2],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["credited"],
      default: "credited",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const ReferralIncome = mongoose.model("ReferralIncome", referralIncomeSchema);

export default ReferralIncome;
