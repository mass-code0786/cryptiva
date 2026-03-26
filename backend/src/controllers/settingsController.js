import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { getSetting, setSetting } from "../services/settingsService.js";

export const getSettingByKey = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "").trim();
  if (!key) {
    throw new ApiError(400, "Setting key is required");
  }

  const value = await getSetting(key);
  res.json({ key, value });
});

export const upsertSettingByKey = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "").trim();
  if (!key) {
    throw new ApiError(400, "Setting key is required");
  }

  if (req.body?.value === undefined) {
    throw new ApiError(400, "Setting value is required");
  }

  const saved = await setSetting(key, req.body.value);
  res.json(saved);
});
