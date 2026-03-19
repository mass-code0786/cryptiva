import mongoose from "mongoose";

const withdrawalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    grossAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    feeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    chargePercent: {
      type: Number,
      default: 10,
      min: 0,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    network: {
      type: String,
      enum: ["BEP20"],
      default: "BEP20",
    },
    currency: {
      type: String,
      enum: ["USDT"],
      default: "USDT",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

withdrawalSchema.pre("validate", function syncWithdrawalAmounts(next) {
  const gross = Number(this.grossAmount || this.amount || 0);
  const fee = Number(this.feeAmount || 0);
  const net = Number(this.netAmount || Math.max(0, gross - fee));

  this.amount = gross;
  this.grossAmount = gross;
  this.feeAmount = fee;
  this.netAmount = net;
  next();
});

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

export default Withdrawal;
