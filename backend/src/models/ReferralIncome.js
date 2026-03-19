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
      default: null,
      index: true,
    },
    tradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trade",
      default: null,
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
      min: 1,
      max: 30,
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
    idempotencyKey: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

referralIncomeSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $ne: "" } } });

const ReferralIncome = mongoose.model("ReferralIncome", referralIncomeSchema);

export default ReferralIncome;
