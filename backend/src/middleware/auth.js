import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { JWT_SECRET } from "../config/env.js";
import User from "../models/User.js";
import { ApiError, asyncHandler } from "./errorHandler.js";

export const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = String(req.headers.authorization || req.headers.Authorization || "").trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim() || String(req.headers["x-access-token"] || "").trim() || null;

  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new ApiError(401, "Invalid token");
  }

  const identity = payload?.id || payload?._id || payload?.userId || payload?.sub;
  if (!identity) {
    throw new ApiError(401, "Invalid token");
  }

  let user = null;
  if (mongoose.isValidObjectId(identity)) {
    user = await User.findById(identity);
  }
  if (!user) {
    user = await User.findOne({ userId: String(identity).toUpperCase() });
  }

  if (!user) {
    throw new ApiError(401, "User not found");
  }
  if (user.isBlocked) {
    throw new ApiError(403, "Your account is blocked. Please contact support.");
  }

  req.user = user;
  next();
});
