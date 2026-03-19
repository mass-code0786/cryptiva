import ReferralIncome from "../models/ReferralIncome.js";
import mongoose from "mongoose";
import Trade from "../models/Trade.js";
import User from "../models/User.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getActivatedUserIdSet, getActivationInvestmentByUserIds, getUserActivationStatusMap } from "../services/activationService.js";

const salaryRankTable = [
  { rank: 1, name: "Rank 1", main: 2000, other: 3000, weeklySalary: 50 },
  { rank: 2, name: "Rank 2", main: 4000, other: 6000, weeklySalary: 100 },
  { rank: 3, name: "Rank 3", main: 10000, other: 15000, weeklySalary: 250 },
  { rank: 4, name: "Rank 4", main: 20000, other: 30000, weeklySalary: 500 },
  { rank: 5, name: "Rank 5", main: 40000, other: 60000, weeklySalary: 1500 },
  { rank: 6, name: "Rank 6", main: 80000, other: 120000, weeklySalary: 5000 },
  { rank: 7, name: "Rank 7", main: 160000, other: 240000, weeklySalary: 15000 },
  { rank: 8, name: "Rank 8", main: 320000, other: 480000, weeklySalary: 50000 },
];

const resolveQualifiedSalaryRank = (mainLegBusiness, otherLegBusiness) => {
  let qualified = 0;
  for (const row of salaryRankTable) {
    if (mainLegBusiness >= row.main && otherLegBusiness >= row.other) {
      qualified = row.rank;
    }
  }
  return qualified;
};

const buildChildMatch = (parentUserId, parentUserRef) => ({
  $or: [{ referredBy: parentUserId }, { referredByUserId: parentUserRef }],
});

const collectAllMembersByLevel = async (rootUserId, maxDepth = 30) => {
  if (!mongoose.isValidObjectId(rootUserId)) {
    return [];
  }

  const rootUser = await User.findById(rootUserId).select("_id userId");
  if (!rootUser) {
    return [];
  }

  const queue = [{ id: rootUser._id, userId: rootUser.userId, level: 0 }];
  const members = [];

  while (queue.length > 0) {
    const { id, userId, level } = queue.shift();
    if (level >= maxDepth) {
      continue;
    }

    const children = await User.find(buildChildMatch(id, userId)).sort({ createdAt: 1 });
    const childIds = children.map((child) => child._id);
    const investmentByUserId = childIds.length ? await getActivationInvestmentByUserIds(childIds) : new Map();
    const activationByUserId = childIds.length ? await getUserActivationStatusMap(childIds) : new Map();

    for (const child of children) {
      const childId = child._id.toString();
      const investment = Number(investmentByUserId.get(childId) || 0);
      const active = Boolean(activationByUserId.get(childId)?.active);
      const nextLevel = level + 1;
      members.push({
        _id: child._id,
        level: nextLevel,
        referredBy: child.referredBy,
        fromUser: {
          id: child._id,
          userId: child.userId,
          name: child.name,
          email: child.email,
          referralCode: child.referralCode,
          walletAddress: child.walletAddress,
        },
        investment,
        status: active ? "active" : "inactive",
        joinedAt: child.createdAt,
      });
      queue.push({ id: child._id, userId: child.userId, level: nextLevel });
    }
  }

  return members;
};

const collectDescendantIds = async (rootUserId) => {
  if (!mongoose.isValidObjectId(rootUserId)) {
    return [];
  }

  const rootUser = await User.findById(rootUserId).select("_id userId");
  if (!rootUser) {
    return [];
  }

  const queue = [{ id: rootUser._id, userId: rootUser.userId }];
  const ids = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const children = await User.find(buildChildMatch(current.id, current.userId), "_id userId");
    for (const child of children) {
      ids.push(child._id);
      queue.push({ id: child._id, userId: child.userId });
    }
  }

  return ids;
};

const sumTeamBusiness = async (userIds) => {
  if (!userIds.length) {
    return 0;
  }

  const activatedUserIdSet = await getActivatedUserIdSet(userIds);
  const activatedUserIds = userIds.filter((userId) => activatedUserIdSet.has(String(userId)));
  if (!activatedUserIds.length) {
    return 0;
  }

  const result = await Trade.aggregate([
    { $match: { userId: { $in: activatedUserIds }, status: { $in: ["active", "completed"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return result[0]?.total || 0;
};

export const listReferrals = asyncHandler(async (req, res) => {
  const referrals = await collectAllMembersByLevel(req.user._id, 30);
  const levelCounts = Array.from({ length: 30 }, (_, index) => index + 1).map((level) => {
    const members = referrals.filter((item) => Number(item.level) === level);
    const active = members.filter((item) => item.status === "active").length;
    return {
      level,
      total: members.length,
      active,
      inactive: Math.max(0, members.length - active),
    };
  });

  const totalDirectTeam = levelCounts.find((row) => row.level === 1)?.total || 0;
  const totalLevelTeam = referrals.length;

  res.json({
    referrals,
    totalDirectTeam,
    totalLevelTeam,
    levelCounts,
  });
});

export const getReferralSummary = asyncHandler(async (req, res) => {
  const { referrals, mainLegBusiness, otherLegBusiness } = await computeTeamBusiness(req.user._id);
  const [incomeSummary] = await ReferralIncome.aggregate([
    { $match: { userId: req.user._id } },
    {
      $group: {
        _id: null,
        directIncome: {
          $sum: {
            $cond: [{ $eq: ["$incomeType", "direct"] }, "$amount", 0],
          },
        },
        levelIncome: {
          $sum: {
            $cond: [{ $eq: ["$incomeType", "level"] }, "$amount", 0],
          },
        },
        totalIncome: { $sum: "$amount" },
      },
    },
  ]);

  res.json({
    referralCode: req.user.referralCode,
    totalReferrals: referrals.length,
    mainLegBusiness,
    otherLegBusiness,
    totalTeamBusiness: mainLegBusiness + otherLegBusiness,
    directIncome: incomeSummary?.directIncome || 0,
    levelIncome: incomeSummary?.levelIncome || 0,
    totalIncome: incomeSummary?.totalIncome || 0,
  });
});

const buildReferralNode = async (user, depthRemaining) => {
  if (depthRemaining <= 0) {
    return {
      id: user._id,
      userId: user.userId,
      name: user.name,
      email: user.email,
      referralCode: user.referralCode,
      children: [],
    };
  }

  const children = await User.find(buildChildMatch(user._id, user.userId)).sort({ createdAt: 1 });
  const childNodes = await Promise.all(children.map((child) => buildReferralNode(child, depthRemaining - 1)));

  return {
    id: user._id,
    userId: user.userId,
    name: user.name,
    email: user.email,
    referralCode: user.referralCode,
    children: childNodes,
  };
};

export const getReferralTree = asyncHandler(async (req, res) => {
  const depth = Math.min(30, Math.max(1, Number.parseInt(req.query.depth, 10) || 30));
  const tree = await buildReferralNode(req.user, depth);

  res.json({
    depth,
    tree,
  });
});

export const getReferralIncome = asyncHandler(async (req, res) => {
  const [incomeSummary] = await ReferralIncome.aggregate([
    { $match: { userId: req.user._id } },
    {
      $group: {
        _id: null,
        directIncome: {
          $sum: {
            $cond: [{ $eq: ["$incomeType", "direct"] }, "$amount", 0],
          },
        },
        levelIncome: {
          $sum: {
            $cond: [{ $eq: ["$incomeType", "level"] }, "$amount", 0],
          },
        },
        totalIncome: { $sum: "$amount" },
      },
    },
  ]);

  res.json({
    directIncome: incomeSummary?.directIncome || 0,
    levelIncome: incomeSummary?.levelIncome || 0,
    totalIncome: incomeSummary?.totalIncome || 0,
  });
});

export const listReferralIncomeHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { userId: req.user._id };
  if (req.query.incomeType) {
    query.incomeType = String(req.query.incomeType).toLowerCase();
  }

  const [items, total] = await Promise.all([
    ReferralIncome.find(query)
      .populate("sourceUserId", "name email userId referralCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ReferralIncome.countDocuments(query),
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

export const computeTeamBusiness = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    return { referrals: [], mainLegBusiness: 0, otherLegBusiness: 0 };
  }

  const rootUser = await User.findById(userId).select("_id userId");
  if (!rootUser) {
    return { referrals: [], mainLegBusiness: 0, otherLegBusiness: 0 };
  }

  const directReferrals = await User.find(buildChildMatch(rootUser._id, rootUser.userId)).sort({ createdAt: 1 });
  const legEntries = [];

  for (const member of directReferrals) {
    const descendants = await collectDescendantIds(member._id);
    const allLegIds = [member._id, ...descendants];
    const teamBusiness = await sumTeamBusiness(allLegIds);
    const directBusiness = await sumTeamBusiness([member._id]);

    legEntries.push({
      id: member._id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      referralCode: member.referralCode,
      walletAddress: member.walletAddress,
      directBusiness,
      teamBusiness,
      joinedAt: member.createdAt,
    });
  }

  const legTotals = legEntries.map((item) => item.teamBusiness);
  legTotals.sort((a, b) => b - a);

  return {
    referrals: legEntries,
    mainLegBusiness: legTotals[0] || 0,
    otherLegBusiness: legTotals.slice(1).reduce((sum, value) => sum + value, 0),
  };
};

const resolveParentUser = async (user) => {
  if (user?.referredBy) {
    if (mongoose.isValidObjectId(user.referredBy)) {
      const byId = await User.findById(user.referredBy).select("_id userId referredBy referredByUserId");
      if (byId) {
        return byId;
      }
    }
    return User.findOne({ userId: String(user.referredBy).toUpperCase() }).select("_id userId referredBy referredByUserId");
  }
  if (user?.referredByUserId) {
    return User.findOne({ userId: user.referredByUserId }).select("_id userId referredBy referredByUserId");
  }
  return null;
};

export const syncTeamBusinessForUser = async (userId) => {
  const result = await computeTeamBusiness(userId);
  const totalTeamBusiness = Number((result.mainLegBusiness + result.otherLegBusiness).toFixed(6));
  if (!mongoose.isValidObjectId(userId)) {
    return { ...result, totalTeamBusiness };
  }

  const user = await User.findById(userId).select("_id salaryRank");
  if (!user) {
    return { ...result, totalTeamBusiness };
  }

  const qualifiedRank = resolveQualifiedSalaryRank(result.mainLegBusiness, result.otherLegBusiness);
  const currentRank = Number(user.salaryRank || 0);
  const nextRank = Math.max(currentRank, qualifiedRank);
  const nextRankMeta = salaryRankTable.find((row) => row.rank === nextRank);

  await User.findByIdAndUpdate(userId, {
    mainLegBusiness: result.mainLegBusiness,
    otherLegBusiness: result.otherLegBusiness,
    totalTeamBusiness,
    salaryRank: nextRank,
    salaryRankName: nextRankMeta?.name || "",
  });
  return { ...result, totalTeamBusiness };
};

export const syncTeamBusinessForUserAndUplines = async (userId, maxLevels = 30) => {
  if (!mongoose.isValidObjectId(userId)) return { updated: 0 };

  const baseUser = await User.findById(userId).select("_id userId referredBy referredByUserId");
  if (!baseUser) return { updated: 0 };

  let currentUser = baseUser;
  let updated = 0;

  for (let level = 1; level <= maxLevels; level += 1) {
    const parent = await resolveParentUser(currentUser);
    if (!parent) break;
    await syncTeamBusinessForUser(parent._id);
    updated += 1;
    currentUser = parent;
  }

  return { updated };
};
