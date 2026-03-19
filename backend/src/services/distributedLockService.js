import crypto from "node:crypto";
import Setting from "../models/Setting.js";

const toMs = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const acquireDistributedLock = async ({
  key,
  ttlMs = 55 * 1000,
  owner = "",
  deps = {},
} = {}) => {
  const SettingModel = deps.SettingModel || Setting;
  const now = Date.now();
  const expiry = now + toMs(ttlMs, 55 * 1000);
  const lockOwner = String(owner || crypto.randomUUID());

  try {
    const doc = await SettingModel.findOneAndUpdate(
      {
        key,
        $or: [{ valueNumber: { $exists: false } }, { valueNumber: { $lte: now } }],
      },
      {
        $set: {
          key,
          valueString: lockOwner,
          valueNumber: expiry,
          metadata: {
            lockKey: key,
            owner: lockOwner,
            acquiredAt: new Date(now).toISOString(),
            expiresAt: new Date(expiry).toISOString(),
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const acquired = String(doc?.valueString || "") === lockOwner && Number(doc?.valueNumber || 0) === expiry;
    return { acquired, key, owner: lockOwner, expiresAt: expiry };
  } catch (error) {
    if (error?.code === 11000) {
      return { acquired: false, key, owner: lockOwner, expiresAt: expiry };
    }
    throw error;
  }
};

export const releaseDistributedLock = async ({ key, owner, deps = {} } = {}) => {
  const SettingModel = deps.SettingModel || Setting;
  if (!key || !owner) return { released: false };

  const result = await SettingModel.updateOne(
    { key, valueString: String(owner) },
    {
      $set: {
        valueNumber: Date.now() - 1,
        metadata: {
          lockKey: key,
          owner: String(owner),
          releasedAt: new Date().toISOString(),
        },
      },
    }
  );

  return { released: Number(result?.modifiedCount || 0) > 0 };
};

export const extendDistributedLock = async ({ key, owner, ttlMs = 55 * 1000, deps = {} } = {}) => {
  const SettingModel = deps.SettingModel || Setting;
  if (!key || !owner) return { extended: false };

  const now = Date.now();
  const nextExpiry = now + toMs(ttlMs, 55 * 1000);
  const result = await SettingModel.updateOne(
    {
      key,
      valueString: String(owner),
      valueNumber: { $gt: now },
    },
    {
      $set: {
        valueNumber: nextExpiry,
        metadata: {
          lockKey: key,
          owner: String(owner),
          extendedAt: new Date(now).toISOString(),
          expiresAt: new Date(nextExpiry).toISOString(),
        },
      },
    }
  );

  return { extended: Number(result?.modifiedCount || 0) > 0, expiresAt: nextExpiry };
};
