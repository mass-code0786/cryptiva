import mongoose from "mongoose";

const packagePurchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trade",
      default: null,
      index: true,
    },
    packageName: {
      type: String,
      default: "wallet_activation",
      trim: true,
      lowercase: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    activationSource: {
      type: String,
      default: "wallet_trade_start",
      trim: true,
      lowercase: true,
      index: true,
    },
    fundingSource: {
      type: String,
      default: "wallet_balance",
      trim: true,
      lowercase: true,
    },
    activatedAt: {
      type: Date,
      default: Date.now,
      index: true,
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

const PackagePurchase = mongoose.model("PackagePurchase", packagePurchaseSchema);

export default PackagePurchase;
