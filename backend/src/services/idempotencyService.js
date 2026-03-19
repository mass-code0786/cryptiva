import crypto from "node:crypto";
import Setting from "../models/Setting.js";

const IDEMPOTENCY_PREFIX = "idempotency_v1:";

const encodeSegment = (value) => {
  if (value === undefined) return "u%3A";
  if (value === null) return "n%3A";
  return encodeURIComponent(`${typeof value}:${String(value)}`);
};

export const generateIdempotencyKey = (scope, fields = {}) => {
  const normalizedScope = encodeSegment(scope || "default");
  const input = fields && typeof fields === "object" ? fields : {};
  const normalizedParts = Object.keys(input)
    .sort()
    .map((key) => `${encodeSegment(key)}=${encodeSegment(input[key])}`)
    .join(":");
  const raw = `${normalizedScope}|${normalizedParts || "na"}`;
  const digest = crypto.createHash("sha256").update(raw).digest("hex");
  return `${IDEMPOTENCY_PREFIX}${digest}`;
};

export const acquireIdempotencyLock = async ({ key, scope = "default", deps = {} } = {}) => {
  const SettingModel = deps.SettingModel || Setting;
  const now = new Date();
  const rawKey = String(key || "").trim();
  const finalKey = rawKey || generateIdempotencyKey(scope, {});

  const result = await SettingModel.updateOne(
    { key: finalKey },
    {
      $setOnInsert: {
        key: finalKey,
        valueString: now.toISOString(),
        valueNumber: now.getTime(),
        metadata: {
          scope: String(scope || "default"),
          lockedAt: now.toISOString(),
        },
      },
    },
    { upsert: true }
  );

  const acquired = Number(result?.upsertedCount || 0) > 0 || Boolean(result?.upsertedId);
  return { acquired, key: finalKey };
};
