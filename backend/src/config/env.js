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
