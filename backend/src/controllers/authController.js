import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../config/env.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";

const buildToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
};

const isAdminEmail = (email) => {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(String(email).toLowerCase());
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, pin, referralCode } = req.body;

  if (!name || !email || !password || !pin) {
    throw new ApiError(400, "Name, email, password and pin are required");
  }

  if (String(password).length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  if (!/^\d{4,6}$/.test(String(pin))) {
    throw new ApiError(400, "PIN must be 4 to 6 digits");
  }

  const existingUser = await User.findOne({ email: String(email).toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, "Email already registered");
  }

  let referredBy = null;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode: String(referralCode).trim().toUpperCase() });
    if (!referrer) {
      throw new ApiError(400, "Invalid referral code");
    }
    referredBy = referrer._id;
  }

  const user = new User({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    referredBy,
    isAdmin: isAdminEmail(email),
  });

  await user.setPassword(String(password));
  await user.setPin(String(pin));
  await user.save();

  await Wallet.create({ userId: user._id });

  res.status(201).json({
    token: buildToken(user._id.toString()),
    user: user.toSafeObject(),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await user.comparePassword(String(password));
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  res.json({
    token: buildToken(user._id.toString()),
    user: user.toSafeObject(),
  });
});
