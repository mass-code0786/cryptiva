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
    tradingWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    tradingIncomeWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    referralIncomeWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    levelIncomeWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    salaryIncomeWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    capCycleVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    capCycleStartedAt: {
      type: Date,
      default: null,
    },
    capCycleIncomeOffset: {
      tradingIncomeWallet: {
        type: Number,
        default: 0,
        min: 0,
      },
      referralIncomeWallet: {
        type: Number,
        default: 0,
        min: 0,
      },
      levelIncomeWallet: {
        type: Number,
        default: 0,
        min: 0,
      },
      salaryIncomeWallet: {
        type: Number,
        default: 0,
        min: 0,
      },
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

walletSchema.pre("validate", function syncTradingWallet(next) {
  const tradingFromLegacy = Number(this.tradingBalance || 0);
  const tradingFromCurrent = Number(this.tradingWallet || 0);
  const resolvedTrading = tradingFromCurrent > 0 ? tradingFromCurrent : tradingFromLegacy;
  this.tradingWallet = resolvedTrading;
  this.tradingBalance = resolvedTrading;
  next();
});

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;
