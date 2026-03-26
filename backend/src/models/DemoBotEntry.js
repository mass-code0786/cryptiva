import mongoose from "mongoose";

const demoBotEntrySchema = new mongoose.Schema(
  {
    asset: {
      type: String,
      enum: ["BTC", "BNB", "ETH", "SOL", "XRP"],
      required: true,
    },
    resultType: {
      type: String,
      enum: ["profit", "loss"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    isDemo: {
      type: Boolean,
      default: true,
      immutable: true,
    },
    visibilityScope: {
      type: String,
      enum: ["global"],
      default: "global",
      immutable: true,
    },
    status: {
      type: String,
      enum: ["live_demo"],
      default: "live_demo",
    },
  },
  { timestamps: true }
);

demoBotEntrySchema.index({ visibilityScope: 1, createdAt: -1 });

const DemoBotEntry = mongoose.model("DemoBotEntry", demoBotEntrySchema);

export default DemoBotEntry;
