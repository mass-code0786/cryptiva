import Deposit from "../models/Deposit.js";
import ReferralIncome from "../models/ReferralIncome.js";
import User from "../models/User.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const collectAllMembersByLevel = async (rootUserId, maxDepth = 30) => {
  const queue = [{ userId: rootUserId, level: 0 }];
  const members = [];

  while (queue.length > 0) {
    const { userId, level } = queue.shift();
    if (level >= maxDepth) {
      continue;
    }

    const children = await User.find({ referredBy: userId }).sort({ createdAt: 1 });
    for (const child of children) {
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
        joinedAt: child.createdAt,
      });
      queue.push({ userId: child._id, level: nextLevel });
    }
  }

  return members;
};

const collectDescendantIds = async (rootUserId) => {
  const queue = [rootUserId];
  const ids = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = await User.find({ referredBy: currentId }, "_id");
    for (const child of children) {
      ids.push(child._id);
      queue.push(child._id);
    }
  }

  return ids;
};

const sumDeposits = async (userIds) => {
  if (!userIds.length) {
    return 0;
  }

  const result = await Deposit.aggregate([
    { $match: { userId: { $in: userIds }, status: "confirmed" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return result[0]?.total || 0;
};

export const listReferrals = asyncHandler(async (req, res) => {
  const referrals = await collectAllMembersByLevel(req.user._id, 30);
  res.json({ referrals });
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

  const children = await User.find({ referredBy: user._id }).sort({ createdAt: 1 });
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
  const depth = Math.min(10, Math.max(1, Number.parseInt(req.query.depth, 10) || 3));
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
  const directReferrals = await User.find({ referredBy: userId }).sort({ createdAt: 1 });
  const legEntries = [];

  for (const member of directReferrals) {
    const descendants = await collectDescendantIds(member._id);
    const allLegIds = [member._id, ...descendants];
    const teamBusiness = await sumDeposits(allLegIds);
    const directBusiness = await sumDeposits([member._id]);

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
