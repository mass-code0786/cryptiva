import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    depositWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    withdrawalWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    tradingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    tradingIncomeWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    depositTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    withdrawTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    p2pTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;
