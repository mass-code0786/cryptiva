import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import SalaryLog from "../models/SalaryLog.js";
import SalaryPayout from "../models/SalaryPayout.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { computeTeamBusiness } from "./referralController.js";
import { logIncomeEvent } from "../services/incomeLogService.js";
import { applyIncomeWithCap } from "../services/incomeCapService.js";

const rankTable = [
  { name: "Rank 1", main: 2000, other: 3000, weeklySalary: 50 },
  { name: "Rank 2", main: 4000, other: 6000, weeklySalary: 100 },
  { name: "Rank 3", main: 10000, other: 15000, weeklySalary: 250 },
  { name: "Rank 4", main: 20000, other: 30000, weeklySalary: 500 },
  { name: "Rank 5", main: 40000, other: 60000, weeklySalary: 1500 },
  { name: "Rank 6", main: 80000, other: 120000, weeklySalary: 5000 },
  { name: "Rank 7", main: 160000, other: 240000, weeklySalary: 15000 },
  { name: "Rank 8", main: 320000, other: 480000, weeklySalary: 50000 },
];

const rankConditionMet = (rank, mainLegBusiness, otherLegBusiness) =>
  Boolean(rank && mainLegBusiness >= rank.main && otherLegBusiness >= rank.other);

const getHighestQualifiedRankIndex = (mainLegBusiness, otherLegBusiness) => {
  let highestIndex = -1;
  rankTable.forEach((rank, index) => {
    if (rankConditionMet(rank, mainLegBusiness, otherLegBusiness)) {
      highestIndex = index;
    }
  });
  return highestIndex;
};

const getWeekRange = (date = new Date()) => {
  const ref = new Date(date);
  const day = ref.getUTCDay();
  const diffToMonday = (day + 6) % 7;

  const weekStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - diffToMonday, 0, 0, 0, 0));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
};

const creditWeeklySalary = async (user, referenceDate = new Date()) => {
  const { mainLegBusiness, otherLegBusiness } = await computeTeamBusiness(user._id);
  const highestQualifiedIndex = getHighestQualifiedRankIndex(mainLegBusiness, otherLegBusiness);
  const highestQualifiedRankNumber = highestQualifiedIndex + 1;
  const currentSavedRankNumber = Number(user.salaryRank || 0);
  const nextSavedRankNumber = Math.max(currentSavedRankNumber, highestQualifiedRankNumber);

  if (nextSavedRankNumber > currentSavedRankNumber) {
    user.salaryRank = nextSavedRankNumber;
    user.salaryRankName = rankTable[nextSavedRankNumber - 1]?.name || "";
    await user.save();
  }

  if (nextSavedRankNumber <= 0) {
    return { status: "skipped_no_rank" };
  }

  const savedRank = rankTable[nextSavedRankNumber - 1];
  if (!rankConditionMet(savedRank, mainLegBusiness, otherLegBusiness)) {
    return { status: "skipped_condition_not_met", rank: nextSavedRankNumber };
  }

  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const existing = await SalaryPayout.findOne({ userId: user._id, weekStart });
  if (existing) {
    return { status: "skipped_already_paid", payout: existing };
  }

  const { creditedAmount } = await applyIncomeWithCap({
    userId: user._id,
    requestedAmount: savedRank.weeklySalary,
    walletField: "salaryIncomeWallet",
  });
  if (creditedAmount <= 0) {
    return { status: "skipped_cap_reached" };
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  const payout = await SalaryPayout.create({
    userId: user._id,
    rankName: savedRank.name,
    amount: creditedAmount,
    mainLegBusiness,
    otherLegBusiness,
    weekStart,
    weekEnd,
    status: "credited",
  });

  const transaction = await Transaction.create({
    userId: user._id,
    type: "SALARY",
    amount: creditedAmount,
    network: "INTERNAL",
    source: `Weekly salary credit for ${savedRank.name}`,
    status: "success",
    metadata: { salaryPayoutId: payout._id, rankName: savedRank.name, rank: nextSavedRankNumber, weekStart, weekEnd },
  });

  await Promise.all([
    logIncomeEvent({
      userId: user._id,
      incomeType: "salary",
      amount: creditedAmount,
      source: `Weekly salary credit for ${savedRank.name}`,
      metadata: { salaryPayoutId: payout._id, rankName: savedRank.name, rank: nextSavedRankNumber, weekStart, weekEnd },
    }),
    SalaryLog.create({
      userId: user._id,
      rank: nextSavedRankNumber,
      amount: creditedAmount,
      weekStart,
      weekEnd,
      date,
      time,
    }),
  ]);

  return { status: "credited", payout, transaction };
};

export const runWeeklySalaryDistribution = async (runDate = new Date()) => {
  const validRunDate = runDate instanceof Date ? runDate : new Date(runDate);
  if (Number.isNaN(validRunDate.getTime())) {
    throw new ApiError(400, "Invalid runDate");
  }
  if (validRunDate.getUTCDay() !== 0) {
    throw new ApiError(400, "Weekly salary can only be distributed on Sunday");
  }

  const users = await User.find({});
  let credited = 0;
  let skippedNoRank = 0;
  let skippedConditionNotMet = 0;
  let skippedAlreadyPaid = 0;
  let skippedCapReached = 0;

  for (const user of users) {
    const result = await creditWeeklySalary(user, validRunDate);
    if (result.status === "credited") {
      credited += 1;
    } else if (result.status === "skipped_no_rank") {
      skippedNoRank += 1;
    } else if (result.status === "skipped_condition_not_met") {
      skippedConditionNotMet += 1;
    } else if (result.status === "skipped_already_paid") {
      skippedAlreadyPaid += 1;
    } else if (result.status === "skipped_cap_reached") {
      skippedCapReached += 1;
    }
  }

  return {
    runDate: validRunDate,
    totalUsers: users.length,
    credited,
    skippedNoRank,
    skippedConditionNotMet,
    skippedAlreadyPaid,
    skippedCapReached,
  };
};

export const getSalaryProgress = asyncHandler(async (req, res) => {
  const { mainLegBusiness, otherLegBusiness } = await computeTeamBusiness(req.user._id);
  const highestQualifiedIndex = getHighestQualifiedRankIndex(mainLegBusiness, otherLegBusiness);
  const highestQualifiedRankNumber = highestQualifiedIndex + 1;
  const storedRank = Number(req.user.salaryRank || 0);
  const savedRankNumber = Math.max(storedRank, highestQualifiedRankNumber);

  if (savedRankNumber > storedRank) {
    const upgradedRank = rankTable[savedRankNumber - 1];
    req.user.salaryRank = savedRankNumber;
    req.user.salaryRankName = upgradedRank?.name || "";
    await req.user.save();
  }

  const savedRank = savedRankNumber > 0 ? rankTable[savedRankNumber - 1] : null;

  const nextRank = rankTable[Math.min(savedRankNumber, rankTable.length - 1)] || rankTable[0];
  const remainingMainLeg = Math.max(0, nextRank.main - mainLegBusiness);
  const remainingOtherLeg = Math.max(0, nextRank.other - otherLegBusiness);
  const remainingBusiness = remainingMainLeg + remainingOtherLeg;

  const progressTarget = Math.max(nextRank.main + nextRank.other, 1);
  const currentProgress = Math.min(mainLegBusiness, nextRank.main) + Math.min(otherLegBusiness, nextRank.other);
  const progressPercentage = savedRankNumber >= rankTable.length ? 100 : (currentProgress / progressTarget) * 100;

  const qualificationActive = savedRank ? highestQualifiedIndex >= savedRankNumber - 1 : false;

  res.json({
    currentRank: savedRank?.name || "Rank 0",
    currentRankNumber: savedRankNumber,
    weeklySalary: qualificationActive ? savedRank?.weeklySalary || 0 : 0,
    salaryAmountForRank: savedRank?.weeklySalary || 0,
    nextRank: nextRank.name,
    nextRankTarget: `${nextRank.main}/${nextRank.other}`,
    mainLegBusiness,
    otherLegBusiness,
    remainingMainLeg,
    remainingOtherLeg,
    remainingBusiness,
    qualificationActive,
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
    SalaryLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SalaryLog.countDocuments(query),
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
  const results = await runWeeklySalaryDistribution(runDate);

  res.json({
    message: "Weekly salary distribution completed",
    runDate: results.runDate,
    results: {
      totalUsers: results.totalUsers,
      credited: results.credited,
      skippedNoRank: results.skippedNoRank,
      skippedConditionNotMet: results.skippedConditionNotMet,
      skippedAlreadyPaid: results.skippedAlreadyPaid,
      skippedCapReached: results.skippedCapReached,
    },
  });
});
