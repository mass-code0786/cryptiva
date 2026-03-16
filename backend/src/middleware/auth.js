import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../config/env.js";
import User from "../models/User.js";
import { ApiError, asyncHandler } from "./errorHandler.js";

export const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new ApiError(401, "Invalid token");
  }

  const user = await User.findById(payload.id);
  if (!user) {
    throw new ApiError(401, "User not found");
  }
  if (user.isBlocked) {
    throw new ApiError(403, "Your account is blocked. Please contact support.");
  }

  req.user = user;
  next();
});
