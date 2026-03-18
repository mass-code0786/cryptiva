import mongoose from "mongoose";
import Trade from "../models/Trade.js";

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
  const investmentByUserId = await getActivationInvestmentByUserIds(userIds);
  const activated = new Set();
  for (const [userId, totalInvestment] of investmentByUserId.entries()) {
    if (totalInvestment >= ACTIVATION_MIN_TRADE_AMOUNT) {
      activated.add(userId);
    }
  }
  return activated;
};

export const countActivatedUsers = async ({ createdFrom = null, createdTo = null } = {}) => {
  const match = { status: { $in: ACTIVATION_TRADE_STATUSES } };
  if (createdFrom || createdTo) {
    match.createdAt = {};
    if (createdFrom) match.createdAt.$gte = createdFrom;
    if (createdTo) match.createdAt.$lte = createdTo;
  }

  const rows = await Trade.aggregate([
    { $match: match },
    { $group: { _id: "$userId", totalInvestment: { $sum: "$amount" } } },
    { $match: { totalInvestment: { $gte: ACTIVATION_MIN_TRADE_AMOUNT } } },
    { $count: "count" },
  ]);

  return Number(rows[0]?.count || 0);
};
