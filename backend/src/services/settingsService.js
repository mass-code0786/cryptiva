import Setting from "../models/Setting.js";

export const getSetting = async (key) => {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return "";

  const setting = await Setting.findOne({ key: normalizedKey }).lean();
  if (!setting) return "";

  const value = String(setting.value || setting.valueString || "").trim();
  return value;
};

export const setSetting = async (key, value) => {
  const normalizedKey = String(key || "").trim();
  const normalizedValue = String(value || "").trim();

  if (!normalizedKey) {
    throw new Error("Setting key is required");
  }

  const setting = await Setting.findOneAndUpdate(
    { key: normalizedKey },
    {
      $set: {
        key: normalizedKey,
        value: normalizedValue,
        valueString: normalizedValue,
      },
    },
    { upsert: true, new: true }
  );

  return {
    key: setting.key,
    value: String(setting.value || setting.valueString || ""),
    updatedAt: setting.updatedAt,
  };
};
