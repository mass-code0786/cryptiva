import mongoose from "mongoose";

const popupBannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 140,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    imagePath: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1024,
    },
    targetUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

popupBannerSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

const PopupBanner = mongoose.model("PopupBanner", popupBannerSchema);

export default PopupBanner;
