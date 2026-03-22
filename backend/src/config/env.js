import dotenv from "dotenv";

dotenv.config();

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
};

export const PORT = Number(process.env.PORT) || 5000;
export const MONGO_URI = requireEnv("MONGO_URI");
export const JWT_SECRET = requireEnv("JWT_SECRET");
export const CLIENT_URL = requireEnv("CLIENT_URL");
export const DEPOSIT_MIN_AMOUNT = Number(process.env.DEPOSIT_MIN_AMOUNT || 5);
export const CRYPTO_GATEWAY_DEFAULT = String(process.env.CRYPTO_GATEWAY_DEFAULT || "nowpayments").trim().toLowerCase();
export const NOWPAYMENTS_API_KEY = String(process.env.NOWPAYMENTS_API_KEY || "").trim();
export const NOWPAYMENTS_IPN_SECRET = String(process.env.NOWPAYMENTS_IPN_SECRET || "").trim();
export const NOWPAYMENTS_IPN_URL = String(process.env.NOWPAYMENTS_IPN_URL || "").trim();
export const NOWPAYMENTS_API_BASE_URL = String(process.env.NOWPAYMENTS_API_BASE_URL || "https://api.nowpayments.io").trim();
export const DEPOSIT_AMOUNT_TOLERANCE_PERCENT = Number(process.env.DEPOSIT_AMOUNT_TOLERANCE_PERCENT || 2);
export const DEPOSIT_PENDING_EXPIRY_HOURS = Number(process.env.DEPOSIT_PENDING_EXPIRY_HOURS || 2);
export const DEPOSIT_EXPIRY_INTERVAL_MS = Number(process.env.DEPOSIT_EXPIRY_INTERVAL_MS || 300000);
export const DEPOSIT_SUCCESS_NOTIFICATION_ENABLED = String(process.env.DEPOSIT_SUCCESS_NOTIFICATION_ENABLED || "true").trim().toLowerCase() !== "false";
export const DEPOSIT_SUCCESS_EMAIL_ENABLED = String(process.env.DEPOSIT_SUCCESS_EMAIL_ENABLED || "false").trim().toLowerCase() === "true";
export const DEPOSIT_EMAIL_WEBHOOK_URL = String(process.env.DEPOSIT_EMAIL_WEBHOOK_URL || "").trim();
export const SYSTEM_NOTIFICATION_SENDER_ID = String(process.env.SYSTEM_NOTIFICATION_SENDER_ID || "").trim();
