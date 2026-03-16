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
      enum: ["pending", "confirmed", "failed"],
      default: "confirmed",
    },
    txHash: {
      type: String,
      default: "",
      trim: true,
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

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;
