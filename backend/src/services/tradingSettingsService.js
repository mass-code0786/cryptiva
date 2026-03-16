import Setting from "../models/Setting.js";

const DEFAULT_TRADING_ROI_PERCENT = 1.2;
const ROI_CACHE_TTL_MS = 30 * 1000;

let cache = {
  value: DEFAULT_TRADING_ROI_PERCENT,
  expiresAt: 0,
};

const normalizePercent = (value) => Number(Number(value).toFixed(6));

export const getTradingRoiPercent = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cache.expiresAt > now) {
    return cache.value;
  }

  const setting = await Setting.findOne({ key: "tradingROI" });
  const value = Number.isFinite(setting?.valueNumber) && setting.valueNumber > 0 ? setting.valueNumber : DEFAULT_TRADING_ROI_PERCENT;
  cache = {
    value: normalizePercent(value),
    expiresAt: now + ROI_CACHE_TTL_MS,
  };
  return cache.value;
};

export const setTradingRoiPercent = async (value) => {
  const normalized = normalizePercent(value);
  const setting = await Setting.findOneAndUpdate(
    { key: "tradingROI" },
    { valueNumber: normalized },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  cache = {
    value: normalized,
    expiresAt: Date.now() + ROI_CACHE_TTL_MS,
  };
  return setting;
};

export const getTradingRoiRatePerMinute = async () => {
  const dailyPercent = await getTradingRoiPercent();
  return Number((dailyPercent / 100 / 1440).toFixed(8));
};
