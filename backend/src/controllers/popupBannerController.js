import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

import PopupBanner from "../models/PopupBanner.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { buildPopupBannerFilename, parseBase64ImageData, sanitizePopupTargetUrl } from "../services/popupBannerService.js";

const BANNER_UPLOAD_DIR = path.join(process.cwd(), "uploads", "banners");
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const ensureBannerUploadDir = async () => {
  await fs.mkdir(BANNER_UPLOAD_DIR, { recursive: true });
};

const toAbsoluteImageUrl = (req, relativePath) => {
  const protoHeader = String(req.headers["x-forwarded-proto"] || "").trim();
  const protocol = protoHeader || req.protocol || "https";
  const host = String(req.get("host") || "").trim();
  if (!host) return relativePath;
  return `${protocol}://${host}${relativePath}`;
};

const getPagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const createPopupBanner = asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const targetUrl = sanitizePopupTargetUrl(req.body.targetUrl || "");
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);
  const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;
  const imageBase64 = String(req.body.imageBase64 || "").trim();
  const originalName = String(req.body.fileName || "").trim();

  if (!imageBase64) {
    throw new ApiError(400, "imageBase64 is required");
  }

  const parsed = parseBase64ImageData(imageBase64);
  await ensureBannerUploadDir();

  const fileName = buildPopupBannerFilename({
    title,
    originalName,
    extension: parsed.extension,
  });
  const outputPath = path.join(BANNER_UPLOAD_DIR, fileName);
  await fs.writeFile(outputPath, parsed.buffer);
  const relativePath = `/uploads/banners/${fileName}`;
  const imageUrl = toAbsoluteImageUrl(req, relativePath);

  if (isActive) {
    await PopupBanner.updateMany({ isActive: true }, { $set: { isActive: false } });
  }

  const item = await PopupBanner.create({
    title,
    imageUrl,
    imagePath: relativePath,
    targetUrl,
    isActive,
    sortOrder,
    createdBy: req.user?._id || null,
  });

  res.status(201).json({ message: "Popup banner created", item });
});

export const listPopupBannersAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    PopupBanner.find({})
      .populate("createdBy", "userId name email")
      .sort({ isActive: -1, sortOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PopupBanner.countDocuments({}),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const updatePopupBannerStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.bannerId || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(404, "Popup banner not found");
  }
  const isActive = Boolean(req.body.isActive);

  const item = await PopupBanner.findById(id);
  if (!item) {
    throw new ApiError(404, "Popup banner not found");
  }

  if (isActive) {
    await PopupBanner.updateMany({ _id: { $ne: item._id }, isActive: true }, { $set: { isActive: false } });
  }

  item.isActive = isActive;
  await item.save();

  res.json({ message: "Popup banner status updated", item });
});

export const deletePopupBanner = asyncHandler(async (req, res) => {
  const id = String(req.params.bannerId || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(404, "Popup banner not found");
  }

  const item = await PopupBanner.findByIdAndDelete(id);
  if (!item) {
    throw new ApiError(404, "Popup banner not found");
  }

  res.json({ message: "Popup banner deleted" });
});

export const getActivePopupBanner = asyncHandler(async (_req, res) => {
  const item = await PopupBanner.findOne({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 });
  res.json({ item: item || null });
});

const resolveBannerFileFromImage = (item) => {
  const normalizedImagePath = String(item?.imagePath || "").trim();
  if (normalizedImagePath.startsWith("/uploads/")) {
    return path.join(process.cwd(), normalizedImagePath.replace(/^\/+/, "").replace(/\//g, path.sep));
  }

  const imageUrl = String(item?.imageUrl || "").trim();
  if (!imageUrl) return "";
  try {
    const parsed = new URL(imageUrl);
    if (parsed.pathname.startsWith("/uploads/")) {
      return path.join(process.cwd(), parsed.pathname.replace(/^\/+/, "").replace(/\//g, path.sep));
    }
  } catch {
    if (imageUrl.startsWith("/uploads/")) {
      return path.join(process.cwd(), imageUrl.replace(/^\/+/, "").replace(/\//g, path.sep));
    }
  }
  return "";
};

const buildDownloadFileName = (item) => {
  const base = String(item?.title || "cryptiva-banner")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const localPath = resolveBannerFileFromImage(item);
  const ext = path.extname(localPath || item?.imageUrl || "").replace(/[^a-zA-Z0-9.]/g, "") || ".jpg";
  return `${base || "cryptiva-banner"}${ext.startsWith(".") ? ext : `.${ext}`}`;
};

export const downloadPopupBannerImage = asyncHandler(async (req, res) => {
  const id = String(req.params.bannerId || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(404, "Popup banner not found");
  }

  const item = await PopupBanner.findById(id);
  if (!item) {
    throw new ApiError(404, "Popup banner not found");
  }

  const filePath = resolveBannerFileFromImage(item);
  const fileName = buildDownloadFileName(item);

  if (!filePath) {
    return res.redirect(item.imageUrl);
  }

  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(UPLOADS_ROOT))) {
    throw new ApiError(400, "Invalid banner file path");
  }

  try {
    await fs.access(normalized);
  } catch {
    return res.redirect(item.imageUrl);
  }

  return res.download(normalized, fileName);
});
