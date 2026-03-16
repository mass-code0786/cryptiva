import mongoose from "mongoose";

const walletBindingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    network: {
      type: String,
      enum: ["BEP20"],
      default: "BEP20",
    },
  },
  {
    timestamps: true,
  }
);

const WalletBinding = mongoose.model("WalletBinding", walletBindingSchema);

export default WalletBinding;
