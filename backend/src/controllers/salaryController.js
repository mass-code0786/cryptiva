import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import SalaryPayout from "../models/SalaryPayout.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { computeTeamBusiness } from "./referralController.js";

const rankTable = [
  { name: "L1", main: 2000, other: 3000, weeklySalary: 25 },
  { name: "L2", main: 5000, other: 7500, weeklySalary: 60 },
  { name: "L3", main: 10000, other: 15000, weeklySalary: 150 },
  { name: "L4", main: 25000, other: 40000, weeklySalary: 400 },
  { name: "L5", main: 50000, other: 80000, weeklySalary: 900 },
  { name: "L6", main: 100000, other: 160000, weeklySalary: 2000 },
  { name: "L7", main: 200000, other: 320000, weeklySalary: 4500 },
  { name: "L8", main: 400000, other: 640000, weeklySalary: 10000 },
];

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

const resolveRank = (mainLegBusiness, otherLegBusiness) => {
  let currentIndex = -1;

  rankTable.forEach((rank, index) => {
    if (mainLegBusiness >= rank.main && otherLegBusiness >= rank.other) {
      currentIndex = index;
    }
  });

  const hasRank = currentIndex >= 0;
  const currentRank = hasRank ? rankTable[currentIndex] : null;
  const nextRank = hasRank ? rankTable[Math.min(currentIndex + 1, rankTable.length - 1)] : rankTable[0];
  const remainingMainLeg = Math.max(0, nextRank.main - mainLegBusiness);
  const remainingOtherLeg = Math.max(0, nextRank.other - otherLegBusiness);
  const progressTarget = Math.max(nextRank.main + nextRank.other, 1);
  const currentProgress = Math.min(mainLegBusiness, nextRank.main) + Math.min(otherLegBusiness, nextRank.other);

  return {
    currentRank,
    nextRank,
    remainingMainLeg,
    remainingOtherLeg,
    progressPercentage: hasRank && currentIndex === rankTable.length - 1 ? 100 : (currentProgress / progressTarget) * 100,
  };
};

const getWeekRange = (date = new Date()) => {
  const ref = new Date(date);
  const day = ref.getUTCDay();
  const diffToMonday = (day + 6) % 7;

  const weekStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - diffToMonday, 0, 0, 0));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
};

const creditWeeklySalary = async (user, referenceDate = new Date()) => {
  const { mainLegBusiness, otherLegBusiness } = await computeTeamBusiness(user._id);
  const { currentRank } = resolveRank(mainLegBusiness, otherLegBusiness);

  if (!currentRank?.weeklySalary) {
    return { status: "skipped_no_rank" };
  }

  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const existing = await SalaryPayout.findOne({ userId: user._id, weekStart });
  if (existing) {
    return { status: "skipped_already_paid", payout: existing };
  }

  const wallet = await ensureWallet(user._id);
  wallet.withdrawalWallet += currentRank.weeklySalary;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const payout = await SalaryPayout.create({
    userId: user._id,
    rankName: currentRank.name,
    amount: currentRank.weeklySalary,
    mainLegBusiness,
    otherLegBusiness,
    weekStart,
    weekEnd,
    status: "credited",
  });

  const transaction = await Transaction.create({
    userId: user._id,
    type: "salary",
    amount: currentRank.weeklySalary,
    network: "INTERNAL",
    source: `Weekly salary credit for ${currentRank.name}`,
    status: "completed",
    metadata: { salaryPayoutId: payout._id, rankName: currentRank.name, weekStart, weekEnd },
  });

  return { status: "credited", payout, transaction };
};

export const getSalaryProgress = asyncHandler(async (req, res) => {
  const { mainLegBusiness, otherLegBusiness } = await computeTeamBusiness(req.user._id);
  const { currentRank, nextRank, remainingMainLeg, remainingOtherLeg, progressPercentage } = resolveRank(
    mainLegBusiness,
    otherLegBusiness
  );

  res.json({
    currentRank: currentRank?.name || "L0",
    nextRank: nextRank.name,
    mainLegBusiness,
    otherLegBusiness,
    remainingMainLeg,
    remainingOtherLeg,
    weeklySalary: currentRank?.weeklySalary || 0,
    progressPercentage,
    ranks: rankTable,
  });
});

export const listSalaryHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { userId: req.user._id };
  const [items, total] = await Promise.all([
    SalaryPayout.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SalaryPayout.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const distributeWeeklySalary = asyncHandler(async (req, res) => {
  const runDate = req.body.runDate ? new Date(req.body.runDate) : new Date();
  if (Number.isNaN(runDate.getTime())) {
    throw new ApiError(400, "Invalid runDate");
  }

  const users = await User.find({}, "_id");
  let credited = 0;
  let skippedNoRank = 0;
  let skippedAlreadyPaid = 0;

  for (const user of users) {
    const result = await creditWeeklySalary(user, runDate);
    if (result.status === "credited") {
      credited += 1;
    } else if (result.status === "skipped_no_rank") {
      skippedNoRank += 1;
    } else if (result.status === "skipped_already_paid") {
      skippedAlreadyPaid += 1;
    }
  }

  res.json({
    message: "Weekly salary distribution completed",
    runDate,
    results: {
      totalUsers: users.length,
      credited,
      skippedNoRank,
      skippedAlreadyPaid,
    },
  });
});
