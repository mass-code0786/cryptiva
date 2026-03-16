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
  const { name, username, email, password, pin, referralCode } = req.body;

  if (!name || !username || !email || !password || !pin) {
    throw new ApiError(400, "Name, username, email, password and pin are required");
  }

  if (String(password).length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const normalizedUsername = String(username).trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(normalizedUsername)) {
    throw new ApiError(400, "Username must be 4-20 characters and contain only letters and numbers");
  }

  if (!/^\d{4,6}$/.test(String(pin))) {
    throw new ApiError(400, "PIN must be 4 to 6 digits");
  }

  const existingUsername = await User.findOne({ username: normalizedUsername });
  if (existingUsername) {
    throw new ApiError(409, "Username already taken");
  }

  const existingUser = await User.findOne({ email: String(email).toLowerCase() });
  if (existingUser) {
    throw new ApiError(409, "Email already registered");
  }

  let referredBy = null;
  let referredByUserId = null;
  if (referralCode) {
    const normalizedReferral = String(referralCode).trim().toUpperCase();
    const referrer =
      (await User.findOne({ userId: normalizedReferral })) ||
      (await User.findOne({ referralCode: normalizedReferral }));
    if (!referrer) {
      throw new ApiError(400, "Invalid referral code");
    }
    referredBy = referrer._id;
    referredByUserId = referrer.userId;
  }

  const user = new User({
    name: String(name).trim(),
    username: normalizedUsername,
    email: String(email).toLowerCase().trim(),
    referredBy,
    referredByUserId,
    isAdmin: isAdminEmail(email),
  });

  await user.setPassword(String(password));
  await user.setPin(String(pin));
  await user.save();

  if (referredBy) {
    await User.findByIdAndUpdate(referredBy, { $addToSet: { referrals: user._id } });
  }

  await Wallet.create({ userId: user._id });

  res.status(201).json({
    token: buildToken(user._id.toString()),
    user: user.toSafeObject(),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw new ApiError(400, "Username and password are required");
  }

  const normalizedUsername = String(username).trim().toUpperCase();
  let user = await User.findOne({ username: normalizedUsername });
  if (!user) {
    user = await User.findOne({ userId: normalizedUsername });
    if (user && !user.username) {
      user.username = user.userId;
      await user.save();
    }
  }

  if (!user) {
    throw new ApiError(401, "Invalid username or password");
  }

  const isMatch = await user.comparePassword(String(password));
  if (!isMatch) {
    throw new ApiError(401, "Invalid username or password");
  }

  if (user.isBlocked) {
    throw new ApiError(403, "Your account is blocked. Please contact support.");
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: buildToken(user._id.toString()),
    user: user.toSafeObject(),
  });
});
