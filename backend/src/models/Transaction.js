import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "deposit",
        "withdraw",
        "trading",
        "referral",
        "level",
        "salary",
        "p2p",
        "p2p_transfer",
        "p2p_receive",
        "P2P_TRANSFER",
        "P2P_RECEIVE",
        "wallet_transfer",
        "admin_transfer",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    network: {
      type: String,
      enum: ["BEP20", "INTERNAL"],
      default: "INTERNAL",
    },
    source: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "failed", "success"],
      default: "completed",
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

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;
