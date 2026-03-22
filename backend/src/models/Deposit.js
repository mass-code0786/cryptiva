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
    requestedCreditAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    expectedPayAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    expectedPayCurrency: {
      type: String,
      default: "",
      trim: true,
    },
    gatewayFeeAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    gatewayFeeCurrency: {
      type: String,
      default: "",
      trim: true,
    },
    payableAmountDisplay: {
      type: String,
      default: null,
      trim: true,
    },
    feeHandlingMode: {
      type: String,
      default: "credit_exact_pay_fee_extra",
      trim: true,
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
      default: undefined,
      trim: true,
      index: true,
      set: (value) => {
        const normalized = String(value || "").trim();
        if (!normalized || ["null", "undefined"].includes(normalized.toLowerCase())) {
          return undefined;
        }
        return normalized;
      },
    },
    gatewayOrderId: {
      type: String,
      default: undefined,
      trim: true,
      index: true,
      set: (value) => {
        const normalized = String(value || "").trim();
        if (!normalized || ["null", "undefined"].includes(normalized.toLowerCase())) {
          return undefined;
        }
        return normalized;
      },
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

depositSchema.pre("validate", function validateGatewayPaymentId(next) {
  const gateway = String(this.gateway || "").trim().toLowerCase();
  const paymentId = String(this.gatewayPaymentId || "").trim();
  if (gateway === "nowpayments" && !paymentId) {
    return next(new Error("gatewayPaymentId is required for nowpayments deposits"));
  }

  const amount = Number(this.amount || 0);
  if (amount > 0 && !(Number(this.requestedCreditAmount) > 0)) {
    this.requestedCreditAmount = amount;
  }

  const payCurrency = String(this.expectedPayCurrency || this.payCurrency || "").trim().toLowerCase();
  if (payCurrency) {
    this.expectedPayCurrency = payCurrency;
  }

  return next();
});

depositSchema.index(
  { gateway: 1, gatewayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      gateway: { $type: "string", $ne: "" },
      gatewayPaymentId: { $type: "string", $ne: "" },
    },
  }
);
depositSchema.index(
  { gateway: 1, gatewayOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      gateway: { $type: "string", $ne: "" },
      gatewayOrderId: { $type: "string", $ne: "" },
    },
  }
);

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;
