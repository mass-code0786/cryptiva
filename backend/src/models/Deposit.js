import mongoose from "mongoose";

const depositSchema = new mongoose.Schema(
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
    currency: {
      type: String,
      default: "USDT",
    },
    network: {
      type: String,
      default: "BEP20",
    },
    status: {
      type: String,
      enum: ["pending", "pending_review", "approved", "rejected", "confirmed", "completed", "failed", "expired"],
      default: "pending",
      index: true,
    },
    gateway: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    gatewayOrderId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    gatewayStatus: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    payCurrency: {
      type: String,
      default: "",
      trim: true,
    },
    txHash: {
      type: String,
      default: "",
      trim: true,
    },
    paymentUrl: {
      type: String,
      default: "",
      trim: true,
    },
    payAddress: {
      type: String,
      default: "",
      trim: true,
    },
    qrData: {
      type: String,
      default: "",
      trim: true,
    },
    webhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    creditedAt: {
      type: Date,
      default: null,
      index: true,
    },
    payment: {
      payment_id: String,
      payment_url: String,
      pay_address: String,
      qr_code_url: String,
    },
  },
  {
    timestamps: true,
  }
);

depositSchema.index({ gateway: 1, gatewayPaymentId: 1 }, { unique: true, sparse: true });
depositSchema.index({ gateway: 1, gatewayOrderId: 1 }, { unique: true, sparse: true });

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;
