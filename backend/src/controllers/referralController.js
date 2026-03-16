import ReferralIncome from "../models/ReferralIncome.js";
import Trade from "../models/Trade.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const buildChildMatch = (parentUserId, parentUserRef) => ({
  $or: [{ referredBy: parentUserId }, { referredByUserId: parentUserRef }],
});

const collectAllMembersByLevel = async (rootUserId, maxDepth = 30) => {
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
    const wallets = childIds.length ? await Wallet.find({ userId: { $in: childIds } }).select("userId tradingWallet tradingBalance") : [];
    const walletMap = new Map(wallets.map((wallet) => [wallet.userId.toString(), wallet]));

    for (const child of children) {
      const wallet = walletMap.get(child._id.toString());
      const investment = Number(wallet?.tradingWallet || wallet?.tradingBalance || 0);
      const active = investment >= 5;
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

  const activeWallets = await Wallet.find({
    userId: { $in: userIds },
    $or: [{ tradingWallet: { $gte: 5 } }, { tradingBalance: { $gte: 5 } }],
  }).select("userId");
  const activeUserIds = activeWallets.map((wallet) => wallet.userId);
  if (!activeUserIds.length) {
    return 0;
  }

  const result = await Trade.aggregate([
    { $match: { userId: { $in: activeUserIds }, status: { $in: ["active", "completed"] } } },
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
    return User.findById(user.referredBy).select("_id userId referredBy referredByUserId");
  }
  if (user?.referredByUserId) {
    return User.findOne({ userId: user.referredByUserId }).select("_id userId referredBy referredByUserId");
  }
  return null;
};

export const syncTeamBusinessForUser = async (userId) => {
  const result = await computeTeamBusiness(userId);
  const totalTeamBusiness = Number((result.mainLegBusiness + result.otherLegBusiness).toFixed(6));
  await User.findByIdAndUpdate(userId, {
    mainLegBusiness: result.mainLegBusiness,
    otherLegBusiness: result.otherLegBusiness,
    totalTeamBusiness,
  });
  return { ...result, totalTeamBusiness };
};

export const syncTeamBusinessForUserAndUplines = async (userId, maxLevels = 30) => {
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
