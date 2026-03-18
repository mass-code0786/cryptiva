import mongoose from "mongoose";
import Trade from "../models/Trade.js";
import User from "../models/User.js";

export const ACTIVATION_MIN_TRADE_AMOUNT = 5;
const ACTIVATION_TRADE_STATUSES = ["active", "completed"];

const normalizeIds = (userIds = []) => {
  const normalized = [];
  const seen = new Set();
  for (const id of userIds) {
    if (!mongoose.isValidObjectId(id)) continue;
    const asString = String(id);
    if (seen.has(asString)) continue;
    seen.add(asString);
    normalized.push(new mongoose.Types.ObjectId(asString));
  }
  return normalized;
};

export const getActivationInvestmentByUserIds = async (userIds = []) => {
  const ids = normalizeIds(userIds);
  if (!ids.length) {
    return new Map();
  }

  const rows = await Trade.aggregate([
    { $match: { userId: { $in: ids }, status: { $in: ACTIVATION_TRADE_STATUSES } } },
    { $group: { _id: "$userId", totalInvestment: { $sum: "$amount" } } },
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), Number(row.totalInvestment || 0));
  }
  return map;
};

export const getActivatedUserIdSet = async (userIds = []) => {
  const statusByUserId = await getUserActivationStatusMap(userIds);
  const activated = new Set();
  for (const [userId, state] of statusByUserId.entries()) {
    if (state.active) {
      activated.add(userId);
    }
  }
  return activated;
};

export const countActivatedUsers = async ({ createdFrom = null, createdTo = null } = {}) => {
  const query = {};
  if (createdFrom || createdTo) {
    query.createdAt = {};
    if (createdFrom) query.createdAt.$gte = createdFrom;
    if (createdTo) query.createdAt.$lte = createdTo;
  }

  const users = await User.find(query).select("_id isActive packageActive packageStatus mlmEligible");
  if (!users.length) {
    return 0;
  }

  const userIds = users.map((user) => user._id);
  const investmentByUserId = await getActivationInvestmentByUserIds(userIds);

  let count = 0;
  for (const user of users) {
    const userId = String(user._id);
    const totalInvestment = Number(investmentByUserId.get(userId) || 0);
    if (resolveActivationState({ user, totalInvestment })) {
      count += 1;
    }
  }

  return count;
};

const resolveActivationState = ({ user, totalInvestment = 0 }) => {
  const packageStatus = String(user?.packageStatus || "").toLowerCase();
  const explicitActive =
    Boolean(user?.isActive) ||
    Boolean(user?.packageActive) ||
    Boolean(user?.mlmEligible) ||
    packageStatus === "active";

  if (explicitActive) {
    return true;
  }

  return Number(totalInvestment || 0) >= ACTIVATION_MIN_TRADE_AMOUNT;
};

export const getUserActivationStatusMap = async (userIds = []) => {
  const ids = normalizeIds(userIds);
  if (!ids.length) {
    return new Map();
  }

  const [users, investmentByUserId] = await Promise.all([
    User.find({ _id: { $in: ids } }).select("_id isActive packageActive packageStatus mlmEligible"),
    getActivationInvestmentByUserIds(ids),
  ]);

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const map = new Map();

  for (const id of ids) {
    const key = String(id);
    const user = userById.get(key);
    const totalInvestment = Number(investmentByUserId.get(key) || 0);
    const active = resolveActivationState({ user, totalInvestment });
    map.set(key, { active, totalInvestment });
  }

  return map;
};

export const activateUserById = async ({ userId, source = "trade_start", activatedAt = new Date() } = {}) => {
  if (!mongoose.isValidObjectId(userId)) {
    return null;
  }

  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        isActive: true,
        packageActive: true,
        packageStatus: "active",
        mlmEligible: true,
        activatedAt,
        lastActivationSource: String(source || "trade_start").toLowerCase(),
      },
    },
    { new: true }
  );
};
