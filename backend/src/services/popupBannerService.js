import path from "node:path";

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const sanitizeBaseName = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const sanitizePopupTargetUrl = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const prefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(prefixed);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
};

export const parseBase64ImageData = (input = "") => {
  const raw = String(input || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data. Expected base64 data URL.");
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const base64Part = String(match[2] || "");
  const extension = MIME_TO_EXT[mimeType];
  if (!extension) {
    throw new Error("Unsupported image type. Use PNG, JPG, WEBP, or GIF.");
  }

  const buffer = Buffer.from(base64Part, "base64");
  if (!buffer.length) {
    throw new Error("Image payload is empty.");
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("Image too large. Maximum size is 5MB.");
  }

  return { mimeType, extension, buffer };
};

export const buildPopupBannerFilename = ({ title = "", originalName = "", extension = "png" } = {}) => {
  const extRaw = String(extension || "").trim().toLowerCase();
  const ext = extRaw.replace(/^\./, "") || "png";
  const fromOriginal = sanitizeBaseName(path.parse(String(originalName || "")).name);
  const fromTitle = sanitizeBaseName(title);
  const base = fromOriginal || fromTitle || "banner";
  return `${base}-${Date.now()}.${ext}`;
};
