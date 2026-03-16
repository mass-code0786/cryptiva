import ActivityLog from "../models/ActivityLog.js";
import Deposit from "../models/Deposit.js";
import IncomeLog from "../models/IncomeLog.js";
import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Withdrawal from "../models/Withdrawal.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { computeTeamBusiness } from "./referralController.js";
import { distributeReferralRewards } from "../services/referralService.js";
import { logIncomeEvent } from "../services/incomeLogService.js";
import { applyIncomeWithCap } from "../services/incomeCapService.js";

const INCOME_TYPES = ["trading", "referral", "level", "salary"];

const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const getTodayRangeUtc = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
};

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

const findUserByParam = async (userRef) => {
  const byId = await User.findById(userRef);
  if (byId) {
    return byId;
  }
  return User.findOne({ userId: String(userRef) });
};

const formatIncomeType = (type) => {
  if (type === "trading") return "Trading";
  if (type === "referral") return "Referral";
  if (type === "level") return "Level";
  if (type === "salary") return "Salary";
  return type;
};

const addActivityLog = async ({ adminId, action, targetUserId = null, amount = null, reason = "", metadata = {} }) => {
  await ActivityLog.create({
    adminId,
    action,
    targetUserId,
    amount,
    reason,
    metadata,
  });
};

const tradingIncomeFilter = {
  type: "trading",
  status: { $in: ["completed", "confirmed"] },
  $or: [{ "metadata.action": { $exists: false } }, { "metadata.action": { $ne: "trade_open" } }],
};

const buildIncomeBaseFilter = () => ({
  type: { $in: INCOME_TYPES },
  status: { $in: ["completed", "confirmed"] },
  $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
});

const getSum = async (model, match) => {
  const result = await model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  return result[0]?.total || 0;
};

const formatTimeSeries = (items, labelKey = "_id", valueKey = "amount") =>
  items.map((item) => ({
    label: item[labelKey],
    value: Number(item[valueKey] || 0),
  }));

const getDailySeries = async (model, match, days = 14, dateField = "createdAt") => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const raw = await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: since } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: `$${dateField}`, timezone: "UTC" },
        },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return formatTimeSeries(raw);
};

const getWeeklySeries = async (match, weeks = 12) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - weeks * 7);
  since.setUTCHours(0, 0, 0, 0);

  const raw = await Transaction.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          year: { $isoWeekYear: "$createdAt" },
          week: { $isoWeek: "$createdAt" },
        },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.year": 1, "_id.week": 1 } },
  ]);

  return raw.map((entry) => ({
    label: `W${entry._id.week}-${entry._id.year}`,
    value: Number(entry.amount || 0),
  }));
};

const getMonthlySeries = async (match, months = 12) => {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (months - 1));
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const raw = await Transaction.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" },
        },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return formatTimeSeries(raw);
};

const getUserGrowthSeries = async (days = 30) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const raw = await User.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" },
        },
        users: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return raw.map((entry) => ({
    label: entry._id,
    value: Number(entry.users || 0),
  }));
};

const buildReferralTree = async (user, depthRemaining = 5, level = 1) => {
  if (depthRemaining <= 0) {
    return [];
  }
  const children = await User.find({ referredBy: user._id }).sort({ createdAt: 1 });
  return Promise.all(
    children.map(async (child) => ({
      id: child._id,
      userId: child.userId,
      name: child.name,
      email: child.email,
      level,
      children: await buildReferralTree(child, depthRemaining - 1, level + 1),
    }))
  );
};

const flattenTreeByLevel = (nodes, map = new Map()) => {
  for (const node of nodes) {
    if (!map.has(node.level)) {
      map.set(node.level, []);
    }
    map.get(node.level).push({
      id: node.id,
      userId: node.userId,
      name: node.name,
      email: node.email,
    });
    flattenTreeByLevel(node.children, map);
  }
  return map;
};

const listIncomeTransactions = async (query, options = {}) => {
  const { page = 1, limit = 500 } = options;
  const skip = (page - 1) * limit;

  const items = await Transaction.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit);

  return items.map((item) => {
    const createdAt = new Date(item.createdAt);
    return {
      id: item._id,
      userId: item.userId?._id?.toString() || null,
      userRef: item.userId?.userId || "-",
      userName: item.userId?.name || "User",
      incomeType: formatIncomeType(item.type),
      amount: item.amount,
      source: item.source || "System income",
      date: createdAt.toISOString().slice(0, 10),
      time: createdAt.toISOString().slice(11, 19),
      createdAt,
      transactionType: item.type,
    };
  });
};
export const getDashboardOverview = asyncHandler(async (_req, res) => {
  const { start, end } = getTodayRangeUtc();

  const [totalUsers, totalActiveUsers, totalInactiveUsers, todayJoiningUsers, todayActiveUsers, totalWithdrawals, todayWithdrawals, totalDeposits, todayDeposits] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isBlocked: { $ne: true } }),
      User.countDocuments({ isBlocked: true }),
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ lastLoginAt: { $gte: start, $lte: end }, isBlocked: { $ne: true } }),
      getSum(Withdrawal, { status: "completed" }),
      getSum(Withdrawal, { status: "completed", createdAt: { $gte: start, $lte: end } }),
      getSum(Deposit, { status: "confirmed" }),
      getSum(Deposit, { status: "confirmed", createdAt: { $gte: start, $lte: end } }),
    ]);

  const [totalTradingIncome, todayTradingIncome, totalReferralIncome, todayReferralIncome, totalLevelIncome, todayLevelIncome, totalSalaryIncome, todaySalaryIncome] =
    await Promise.all([
      getSum(Transaction, tradingIncomeFilter),
      getSum(Transaction, { ...tradingIncomeFilter, createdAt: { $gte: start, $lte: end } }),
      getSum(Transaction, { type: "referral", status: { $in: ["completed", "confirmed"] } }),
      getSum(Transaction, { type: "referral", status: { $in: ["completed", "confirmed"] }, createdAt: { $gte: start, $lte: end } }),
      getSum(Transaction, { type: "level", status: { $in: ["completed", "confirmed"] } }),
      getSum(Transaction, { type: "level", status: { $in: ["completed", "confirmed"] }, createdAt: { $gte: start, $lte: end } }),
      getSum(Transaction, { type: "salary", status: { $in: ["completed", "confirmed"] } }),
      getSum(Transaction, { type: "salary", status: { $in: ["completed", "confirmed"] }, createdAt: { $gte: start, $lte: end } }),
    ]);

  res.json({
    users: {
      totalUsers,
      totalActiveUsers,
      totalInactiveUsers,
      todayJoiningUsers,
      todayActiveUsers,
    },
    income: {
      totalTradingIncome,
      todayTradingIncome,
      totalReferralIncome,
      todayReferralIncome,
      totalLevelIncome,
      todayLevelIncome,
      totalSalaryIncome,
      todaySalaryIncome,
    },
    finance: {
      totalWithdrawals,
      todayWithdrawals,
      totalDeposits,
      todayDeposits,
    },
  });
});

export const getDashboardAnalytics = asyncHandler(async (_req, res) => {
  const incomeMatch = buildIncomeBaseFilter();

  const [dailyTradingIncome, weeklyIncome, monthlyIncome, userGrowth, withdrawalChart, depositChart] = await Promise.all([
    getDailySeries(Transaction, tradingIncomeFilter, 14),
    getWeeklySeries(incomeMatch, 12),
    getMonthlySeries(incomeMatch, 12),
    getUserGrowthSeries(30),
    getDailySeries(Withdrawal, { status: "completed" }, 30),
    getDailySeries(Deposit, { status: "confirmed" }, 30),
  ]);

  res.json({
    dailyTradingIncome,
    weeklyIncome,
    monthlyIncome,
    userGrowth,
    withdrawalChart,
    depositChart,
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();
  const sortBy = String(req.query.sortBy || "joindate").toLowerCase();
  const sortOrder = String(req.query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;

  const match = {};
  if (search) {
    match.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { userId: { $regex: search, $options: "i" } },
    ];
  }

  if (status === "active") {
    match.isBlocked = { $ne: true };
  } else if (status === "inactive") {
    match.isBlocked = true;
  }

  const total = await User.countDocuments(match);

  const sortStage = sortBy === "income" ? { totalIncome: sortOrder, createdAt: -1 } : { createdAt: sortOrder };

  const users = await User.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "wallets",
        localField: "_id",
        foreignField: "userId",
        as: "walletArr",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { uid: "$_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$referredBy", "$$uid"] } } }, { $count: "count" }],
        as: "referralAgg",
      },
    },
    {
      $lookup: {
        from: "transactions",
        let: { uid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$uid"] },
              type: { $in: INCOME_TYPES },
              status: { $in: ["completed", "confirmed"] },
              $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
            },
          },
          { $group: { _id: null, totalIncome: { $sum: "$amount" } } },
        ],
        as: "incomeAgg",
      },
    },
    {
      $addFields: {
        wallet: { $arrayElemAt: ["$walletArr", 0] },
        referralCount: { $ifNull: [{ $arrayElemAt: ["$referralAgg.count", 0] }, 0] },
        totalIncome: { $ifNull: [{ $arrayElemAt: ["$incomeAgg.totalIncome", 0] }, 0] },
      },
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        name: 1,
        email: 1,
        referralCode: 1,
        walletAddress: 1,
        isAdmin: 1,
        isBlocked: 1,
        lastLoginAt: 1,
        createdAt: 1,
        walletBalance: { $ifNull: ["$wallet.balance", 0] },
        tradingBalance: { $ifNull: ["$wallet.tradingBalance", 0] },
        referralCount: 1,
        totalIncome: 1,
      },
    },
    { $sort: sortStage },
    { $skip: skip },
    { $limit: limit },
  ]);

  res.json({
    items: users.map((user) => ({
      id: user._id.toString(),
      userId: user.userId,
      name: user.name,
      email: user.email,
      referralCode: user.referralCode,
      walletAddress: user.walletAddress,
      role: user.isAdmin ? "admin" : "user",
      isAdmin: user.isAdmin,
      isBlocked: user.isBlocked,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      walletBalance: user.walletBalance || 0,
      tradingBalance: user.tradingBalance || 0,
      referralCount: user.referralCount || 0,
      totalIncome: user.totalIncome || 0,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
export const getUserProfileDetail = asyncHandler(async (req, res) => {
  const user = await findUserByParam(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const [wallet, incomeHistory, referralTree, directReferralCount, incomeBreakdownAgg] = await Promise.all([
    Wallet.findOne({ userId: user._id }),
    listIncomeTransactions({
      userId: user._id,
      type: { $in: INCOME_TYPES },
      status: { $in: ["completed", "confirmed"] },
      $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
    }),
    buildReferralTree(user, 10, 1),
    User.countDocuments({ referredBy: user._id }),
    Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: { $in: INCOME_TYPES },
          status: { $in: ["completed", "confirmed"] },
          $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
        },
      },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
  ]);

  const incomeBreakdown = {
    tradingIncome: 0,
    referralIncome: 0,
    levelIncome: 0,
    salaryIncome: 0,
  };

  for (const row of incomeBreakdownAgg) {
    if (row._id === "trading") incomeBreakdown.tradingIncome = row.total;
    if (row._id === "referral") incomeBreakdown.referralIncome = row.total;
    if (row._id === "level") incomeBreakdown.levelIncome = row.total;
    if (row._id === "salary") incomeBreakdown.salaryIncome = row.total;
  }

  res.json({
    user: {
      ...user.toSafeObject(),
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      isBlocked: user.isBlocked,
      referralCount: directReferralCount,
    },
    wallet: wallet || null,
    incomeBreakdown,
    referralTree,
    incomeHistory,
  });
});

export const getReferralTreeAdmin = asyncHandler(async (req, res) => {
  const depth = Math.min(10, Math.max(1, Number.parseInt(req.query.depth, 10) || 5));

  let rootUser = null;
  if (req.query.userId) {
    rootUser = await findUserByParam(req.query.userId);
  } else {
    rootUser = await User.findOne({ isAdmin: { $ne: true } }).sort({ createdAt: 1 });
  }

  if (!rootUser) {
    throw new ApiError(404, "User not found");
  }

  const tree = await buildReferralTree(rootUser, depth, 1);
  const levelsMap = flattenTreeByLevel(tree);
  const levels = Array.from(levelsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, users]) => ({ level, users }));

  res.json({
    rootUser: {
      id: rootUser._id,
      userId: rootUser.userId,
      name: rootUser.name,
      email: rootUser.email,
    },
    depth,
    totalDescendants: levels.reduce((sum, entry) => sum + entry.users.length, 0),
    levels,
    tree,
  });
});

export const blockUser = asyncHandler(async (req, res) => {
  const user = await findUserByParam(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.isAdmin) {
    throw new ApiError(400, "Admin user cannot be blocked");
  }

  user.isBlocked = true;
  await user.save();

  await addActivityLog({
    adminId: req.user._id,
    action: "User blocked",
    targetUserId: user._id,
    reason: "Blocked by admin",
    metadata: { userId: user.userId, email: user.email },
  });

  res.json({ message: "User blocked successfully", user: user.toSafeObject() });
});

export const unblockUser = asyncHandler(async (req, res) => {
  const user = await findUserByParam(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.isBlocked = false;
  await user.save();

  await addActivityLog({
    adminId: req.user._id,
    action: "User unblocked",
    targetUserId: user._id,
    reason: "Unblocked by admin",
    metadata: { userId: user.userId, email: user.email },
  });

  res.json({ message: "User unblocked successfully", user: user.toSafeObject() });
});

export const transferFund = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  const amountValue = Number(amount);

  if (!userId || !Number.isFinite(amountValue) || amountValue <= 0) {
    throw new ApiError(400, "userId and valid amount are required");
  }

  const user = await findUserByParam(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const wallet = await ensureWallet(user._id);
  wallet.depositWallet += amountValue;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  await Transaction.create({
    userId: user._id,
    type: "wallet_transfer",
    amount: amountValue,
    network: "INTERNAL",
    source: reason ? `Admin fund transfer: ${reason}` : "Admin fund transfer",
    status: "completed",
    metadata: { action: "admin_fund_transfer", adminId: req.user._id, reason: reason || "" },
  });

  await addActivityLog({
    adminId: req.user._id,
    action: "Fund transferred",
    targetUserId: user._id,
    amount: amountValue,
    reason: reason || "",
    metadata: { userId: user.userId },
  });

  res.json({ message: "Fund transferred successfully", wallet });
});

export const deductFund = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  const amountValue = Number(amount);

  if (!userId || !Number.isFinite(amountValue) || amountValue <= 0) {
    throw new ApiError(400, "userId and valid amount are required");
  }

  const user = await findUserByParam(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const wallet = await ensureWallet(user._id);
  const totalAvailable = wallet.depositWallet + wallet.withdrawalWallet;
  if (totalAvailable < amountValue) {
    throw new ApiError(400, "Insufficient wallet balance for deduction");
  }

  let remaining = amountValue;
  const deductFromDeposit = Math.min(wallet.depositWallet, remaining);
  wallet.depositWallet -= deductFromDeposit;
  remaining -= deductFromDeposit;
  if (remaining > 0) {
    wallet.withdrawalWallet = Math.max(0, wallet.withdrawalWallet - remaining);
  }
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  await Transaction.create({
    userId: user._id,
    type: "wallet_transfer",
    amount: amountValue,
    network: "INTERNAL",
    source: reason ? `Admin fund deduction: ${reason}` : "Admin fund deduction",
    status: "completed",
    metadata: { action: "admin_fund_deduct", adminId: req.user._id, reason: reason || "" },
  });

  await addActivityLog({
    adminId: req.user._id,
    action: "Fund deducted",
    targetUserId: user._id,
    amount: amountValue,
    reason: reason || "",
    metadata: { userId: user.userId },
  });

  res.json({ message: "Fund deducted successfully", wallet });
});
export const listDeposits = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.status) {
    query.status = String(req.query.status).toLowerCase();
  }

  const [items, total] = await Promise.all([
    Deposit.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Deposit.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const approveDeposit = asyncHandler(async (req, res) => {
  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) throw new ApiError(404, "Deposit request not found");
  if (deposit.status !== "pending") throw new ApiError(400, "Deposit is already processed");

  const user = await User.findById(deposit.userId);
  if (!user) throw new ApiError(404, "User not found for deposit");

  const wallet = await ensureWallet(user._id);
  wallet.depositWallet += deposit.amount;
  wallet.depositTotal += deposit.amount;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  deposit.status = "confirmed";
  await deposit.save();

  await Promise.all([
    Transaction.findOneAndUpdate(
      { "metadata.depositId": deposit._id, type: "deposit" },
      { status: "confirmed", source: "Deposit approved by admin" },
      { new: true }
    ),
    distributeReferralRewards({ user, depositAmount: deposit.amount, depositId: deposit._id }),
  ]);

  res.json({ message: "Deposit approved", deposit, wallet });
});

export const rejectDeposit = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "Rejected by admin").trim();
  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) throw new ApiError(404, "Deposit request not found");
  if (deposit.status !== "pending") throw new ApiError(400, "Deposit is already processed");

  deposit.status = "failed";
  await deposit.save();
  await Transaction.findOneAndUpdate(
    { "metadata.depositId": deposit._id, type: "deposit" },
    { status: "failed", source: `Deposit rejected: ${reason}` },
    { new: true }
  );

  res.json({ message: "Deposit rejected", deposit });
});

export const listWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.status) {
    query.status = String(req.query.status).toLowerCase();
  }

  const [items, total] = await Promise.all([
    Withdrawal.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Withdrawal.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const listTrades = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.status) {
    query.status = String(req.query.status).toLowerCase();
  }
  if (req.query.userId) {
    const user = await findUserByParam(req.query.userId);
    if (!user) throw new ApiError(404, "User not found");
    query.userId = user._id;
  }

  const [items, total] = await Promise.all([
    Trade.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Trade.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const updateTradeProfitRate = asyncHandler(async (req, res) => {
  const trade = await Trade.findById(req.params.tradeId).populate("userId", "userId email");
  if (!trade) throw new ApiError(404, "Trade not found");

  const profitPercentage = Number(req.body.profitPercentage);
  if (!Number.isFinite(profitPercentage) || profitPercentage < 0) {
    throw new ApiError(400, "profitPercentage must be a valid number >= 0");
  }

  trade.manualRoiRate = Number((profitPercentage / 100).toFixed(6));
  await trade.save();

  await addActivityLog({
    adminId: req.user._id,
    action: "Trading profit percentage updated",
    targetUserId: trade.userId?._id || trade.userId,
    reason: `Profit % per minute set to ${profitPercentage}`,
    metadata: { tradeId: trade._id, manualRoiRate: trade.manualRoiRate },
  });

  res.json({ message: "Trade profit percentage updated", trade, appliedProfitPercentage: profitPercentage });
});

export const adjustTradeIncome = asyncHandler(async (req, res) => {
  const { tradeId, action, amount, reason } = req.body;
  const amountValue = Number(amount);
  const normalizedAction = String(action || "").toLowerCase();

  if (!tradeId || !Number.isFinite(amountValue) || amountValue <= 0) {
    throw new ApiError(400, "tradeId and valid amount are required");
  }
  if (!["increase", "decrease"].includes(normalizedAction)) {
    throw new ApiError(400, "action must be increase or decrease");
  }

  const trade = await Trade.findById(tradeId);
  if (!trade) throw new ApiError(404, "Trade not found");

  const wallet = await ensureWallet(trade.userId);
    if (normalizedAction === "increase") {
      const delta = amountValue;
      const { creditedAmount, capReached, state } = await applyIncomeWithCap({
        userId: trade.userId,
        requestedAmount: delta,
        walletField: "tradingIncomeWallet",
      });
      if (creditedAmount <= 0 && capReached) {
        throw new ApiError(400, "Income cap reached for this user");
      }
      trade.totalIncome = Number((trade.totalIncome + creditedAmount).toFixed(6));

      await Promise.all([
        trade.save(),
        Transaction.create({
          userId: trade.userId,
          type: "trading",
          amount: creditedAmount,
          network: "INTERNAL",
          source: reason ? `Admin increased trading income: ${reason}` : "Admin increased trading income",
        status: "completed",
        metadata: { action: "admin_increase", tradeId: trade._id, adminId: req.user._id },
      }),
        logIncomeEvent({
          userId: trade.userId,
          incomeType: "trading",
          amount: creditedAmount,
          source: reason ? `Admin increased trading income: ${reason}` : "Admin increased trading income",
        metadata: { tradeId: trade._id, adminId: req.user._id, action: "admin_increase" },
      }),
    ]);

      await addActivityLog({
        adminId: req.user._id,
        action: "Trading income increased",
        targetUserId: trade.userId,
        amount: creditedAmount,
        reason: reason || "",
        metadata: { tradeId: trade._id },
      });

    return res.json({ message: "Trading income increased", trade, wallet: state.wallet, credited: creditedAmount });
  }

  if (wallet.withdrawalWallet < amountValue) {
    throw new ApiError(400, "User withdrawal wallet has insufficient balance for income decrease");
  }
  if (trade.totalIncome < amountValue) {
    throw new ApiError(400, "Cannot decrease more than current trade income");
  }

  trade.totalIncome = Number((trade.totalIncome - amountValue).toFixed(6));
  wallet.tradingIncomeWallet = Number(wallet.tradingIncomeWallet || 0);
  wallet.tradingIncomeWallet = Math.max(0, wallet.tradingIncomeWallet - amountValue);
  wallet.withdrawalWallet -= amountValue;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;

  await Promise.all([
    trade.save(),
    wallet.save(),
    Transaction.create({
      userId: trade.userId,
      type: "trading",
      amount: amountValue,
      network: "INTERNAL",
      source: reason ? `Admin decreased trading income: ${reason}` : "Admin decreased trading income",
      status: "completed",
      metadata: { action: "admin_decrease", tradeId: trade._id, adminId: req.user._id },
    }),
  ]);

  await addActivityLog({
    adminId: req.user._id,
    action: "Trading income decreased",
    targetUserId: trade.userId,
    amount: amountValue,
    reason: reason || "",
    metadata: { tradeId: trade._id },
  });

  res.json({ message: "Trading income decreased", trade, wallet, debited: amountValue });
});

export const approveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
  if (!withdrawal) throw new ApiError(404, "Withdrawal request not found");
  if (withdrawal.status !== "pending") throw new ApiError(400, "Withdrawal is already processed");

  withdrawal.status = "completed";
  withdrawal.approvedAt = new Date();
  withdrawal.reviewedBy = req.user._id;
  await withdrawal.save();

  await Promise.all([
    Transaction.findOneAndUpdate({ "metadata.withdrawalId": withdrawal._id, type: "withdraw" }, { status: "completed" }, { new: true }),
    addActivityLog({
      adminId: req.user._id,
      action: "Withdrawal approved",
      targetUserId: withdrawal.userId,
      amount: withdrawal.amount,
      metadata: { withdrawalId: withdrawal._id },
    }),
  ]);

  res.json({ message: "Withdrawal marked as completed", withdrawal });
});

export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "Rejected by admin").trim();
  const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
  if (!withdrawal) throw new ApiError(404, "Withdrawal request not found");
  if (withdrawal.status !== "pending") throw new ApiError(400, "Withdrawal is already processed");

  const wallet = await Wallet.findOne({ userId: withdrawal.userId });
  if (!wallet) throw new ApiError(404, "Wallet not found for withdrawal user");

  wallet.withdrawalWallet += withdrawal.amount;
  wallet.withdrawTotal = Math.max(0, wallet.withdrawTotal - withdrawal.amount);
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  withdrawal.status = "rejected";
  withdrawal.reviewedBy = req.user._id;
  withdrawal.rejectionReason = reason;
  await withdrawal.save();

  await Promise.all([
    Transaction.findOneAndUpdate(
      { "metadata.withdrawalId": withdrawal._id, type: "withdraw" },
      { status: "failed", source: `Withdrawal rejected: ${reason}` },
      { new: true }
    ),
    addActivityLog({
      adminId: req.user._id,
      action: "Withdrawal rejected",
      targetUserId: withdrawal.userId,
      amount: withdrawal.amount,
      reason,
      metadata: { withdrawalId: withdrawal._id },
    }),
  ]);

  res.json({ message: "Withdrawal rejected and amount refunded", withdrawal, wallet });
});
export const listTransactionsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.type) query.type = String(req.query.type);
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.userId) {
    const user = await findUserByParam(req.query.userId);
    if (!user) throw new ApiError(404, "User not found");
    query.userId = user._id;
  }

  const [items, total] = await Promise.all([
    Transaction.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getIncomeHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search = String(req.query.search || "").trim();
  const incomeType = String(req.query.incomeType || "").toLowerCase();

  const incomeLogQuery = {};
  if (INCOME_TYPES.includes(incomeType)) {
    incomeLogQuery.incomeType = incomeType;
  }

  if (req.query.userId) {
    const user = await findUserByParam(req.query.userId);
    if (!user) throw new ApiError(404, "User not found");
    incomeLogQuery.userId = user._id;
  }

  if (search) {
    const users = await User.find({
      $or: [{ userId: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }],
    }).select("_id");
    if (!users.length) {
      return res.json({ items: [], pagination: { page, limit, total: 0, pages: 1 } });
    }
    incomeLogQuery.userId = { $in: users.map((user) => user._id) };
  }

  const [items, total] = await Promise.all([
    IncomeLog.find(incomeLogQuery).populate("userId", "name email userId").sort({ recordedAt: -1 }).skip(skip).limit(limit),
    IncomeLog.countDocuments(incomeLogQuery),
  ]);

  if (total > 0) {
    return res.json({
      items: items.map((item) => {
        const createdAt = new Date(item.recordedAt || item.createdAt);
        return {
          id: item._id,
          userId: item.userId?._id?.toString() || null,
          userRef: item.userId?.userId || "-",
          userName: item.userId?.name || "User",
          incomeType: formatIncomeType(item.incomeType),
          amount: item.amount,
          source: item.source || "System income",
          date: createdAt.toISOString().slice(0, 10),
          time: createdAt.toISOString().slice(11, 19),
          createdAt,
        };
      }),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  }

  const fallbackQuery = {
    type: incomeType && INCOME_TYPES.includes(incomeType) ? incomeType : { $in: INCOME_TYPES },
    status: { $in: ["completed", "confirmed"] },
    $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
  };
  if (incomeLogQuery.userId) fallbackQuery.userId = incomeLogQuery.userId;

  const fallbackTotal = await Transaction.countDocuments(fallbackQuery);
  const fallbackItems = await listIncomeTransactions(fallbackQuery, { page, limit });
  res.json({
    items: fallbackItems,
    pagination: { page, limit, total: fallbackTotal, pages: Math.max(1, Math.ceil(fallbackTotal / limit)) },
  });
});

export const listActivityLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.search) {
    const search = String(req.query.search).trim();
    const users = await User.find({
      $or: [{ userId: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }],
    }).select("_id");
    const ids = users.map((entry) => entry._id);
    query.$or = [{ action: { $regex: search, $options: "i" } }];
    if (ids.length) {
      query.$or.push({ adminId: { $in: ids } }, { targetUserId: { $in: ids } });
    }
  }

  const [items, total] = await Promise.all([
    ActivityLog.find(query)
      .populate("adminId", "name email userId")
      .populate("targetUserId", "name email userId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ActivityLog.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getTeamBusiness = asyncHandler(async (req, res) => {
  if (req.query.userId) {
    const user = await findUserByParam(req.query.userId);
    if (!user) throw new ApiError(404, "User not found");

    const result = await computeTeamBusiness(user._id);
    return res.json({
      user: { id: user._id, userId: user.userId, name: user.name, email: user.email },
      ...result,
      totalTeamBusiness: result.mainLegBusiness + result.otherLegBusiness,
    });
  }

  const { page, limit, skip } = getPagination(req.query);
  const [users, total] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments({}),
  ]);

  const items = [];
  for (const user of users) {
    const result = await computeTeamBusiness(user._id);
    items.push({
      user: { id: user._id, userId: user.userId, name: user.name, email: user.email },
      mainLegBusiness: result.mainLegBusiness,
      otherLegBusiness: result.otherLegBusiness,
      totalTeamBusiness: result.mainLegBusiness + result.otherLegBusiness,
      referralCount: result.referrals.length,
    });
  }

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});
