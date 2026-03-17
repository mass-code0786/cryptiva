import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema(
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
    totalIncome: {
      type: Number,
      default: 0,
      min: 0,
    },
    roiGenerated: {
      type: Number,
      default: 0,
      min: 0,
    },
    capping: {
      type: Number,
      required: true,
      min: 0,
    },
    investmentLimit: {
      type: Number,
      required: true,
      min: 0,
    },
    manualRoiRate: {
      type: Number,
      default: null,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    lastSettledAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

tradeSchema.pre("validate", function syncInvestmentLimit(next) {
  if (!this.investmentLimit && this.capping) {
    this.investmentLimit = this.capping;
  }

  if (!this.capping && this.investmentLimit) {
    this.capping = this.investmentLimit;
  }

  if (!Number.isFinite(Number(this.roiGenerated))) {
    this.roiGenerated = Number(this.totalIncome || 0);
  }

  if (Number(this.roiGenerated || 0) < Number(this.totalIncome || 0)) {
    this.roiGenerated = Number(this.totalIncome || 0);
  }

  next();
});

const Trade = mongoose.model("Trade", tradeSchema);

export default Trade;
