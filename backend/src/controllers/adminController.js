import ActivityLog from "../models/ActivityLog.js";
import mongoose from "mongoose";
import Deposit from "../models/Deposit.js";
import IncomeLog from "../models/IncomeLog.js";
import SupportQuery from "../models/SupportQuery.js";
import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Withdrawal from "../models/Withdrawal.js";
import { DEPOSIT_AMOUNT_TOLERANCE_PERCENT } from "../config/env.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { computeTeamBusiness, syncTeamBusinessForUserAndUplines } from "./referralController.js";
import { logIncomeEvent } from "../services/incomeLogService.js";
import { applyIncomeWithCap } from "../services/incomeCapService.js";
import { ACTIVATION_MIN_TRADE_AMOUNT, countActivatedUsers } from "../services/activationService.js";
import { getTradingRoiPercent, setTradingRoiPercent } from "../services/tradingSettingsService.js";
import { startTradeAndActivate } from "../services/tradeActivationService.js";
import { validateStrongPassword } from "../services/passwordPolicyService.js";
import { resetUserPasswordByAdminAction } from "../services/adminPasswordService.js";
import { getUserCapCycleDiagnostics } from "../services/adminDiagnosticsService.js";
import { creditDepositOnce, markDepositFailedOrExpired } from "../services/depositCreditService.js";
import {
  extractGatewayWebhookData,
  getGatewayPaymentStatus,
  isGatewaySuccessFinalStatus,
  mapGatewayStatusToDepositStatus,
  validateReceivedAmountAgainstExpected,
} from "../services/liveDepositGatewayService.js";

const adminDepositDeps = {
  getGatewayPaymentStatus,
  extractGatewayWebhookData,
  mapGatewayStatusToDepositStatus,
  isGatewaySuccessFinalStatus,
  validateReceivedAmountAgainstExpected,
  creditDepositOnce,
  markDepositFailedOrExpired,
};

export const __setAdminDepositDeps = (overrides = {}) => {
  Object.assign(adminDepositDeps, overrides || {});
};

export const __resetAdminDepositDeps = () => {
  Object.assign(adminDepositDeps, {
    getGatewayPaymentStatus,
    extractGatewayWebhookData,
    mapGatewayStatusToDepositStatus,
    isGatewaySuccessFinalStatus,
    validateReceivedAmountAgainstExpected,
    creditDepositOnce,
    markDepositFailedOrExpired,
  });
};

const INCOME_TYPES = ["trading", "referral", "REFERRAL", "level", "LEVEL", "salary", "SALARY"];

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

const upsertDepositTransaction = async ({ deposit, status, source, metadata = {} }) =>
  Transaction.findOneAndUpdate(
    { userId: deposit.userId, type: "deposit", "metadata.depositId": deposit._id },
    {
      $set: {
        userId: deposit.userId,
        type: "deposit",
        amount: Number(deposit.amount || 0),
        network: deposit.network || "BEP20",
        source,
        status,
        metadata: {
          depositId: deposit._id,
          currency: deposit.currency,
          network: deposit.network,
          gateway: deposit.gateway,
          gatewayPaymentId: deposit.gatewayPaymentId || "",
          gatewayOrderId: deposit.gatewayOrderId || "",
          ...metadata,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

const findUserByParam = async (userRef) => {
  const normalizedRef = String(userRef || "").trim();
  if (!normalizedRef) {
    return null;
  }

  if (mongoose.isValidObjectId(normalizedRef)) {
    const byId = await User.findById(normalizedRef);
    if (byId) {
      return byId;
    }
  }

  const byUserId = await User.findOne({ userId: normalizedRef.toUpperCase() });
  if (byUserId) {
    return byUserId;
  }

  const byReferralCode = await User.findOne({ referralCode: normalizedRef.toLowerCase() });
  if (byReferralCode) {
    return byReferralCode;
  }

  return User.findOne({ username: normalizedRef.toUpperCase() });
};

const formatIncomeType = (type) => {
  if (type === "trading") return "Trading";
  if (type === "referral" || type === "REFERRAL") return "Referral";
  if (type === "level" || type === "LEVEL") return "Level";
  if (type === "salary" || type === "SALARY") return "Salary";
  return type;
};

const addActivityLog = async ({ adminId, action, type = "admin_action", targetUserId = null, amount = null, reason = "", metadata = {} }) => {
  const now = new Date();
  await ActivityLog.create({
    adminId,
    type,
    action,
    userId: targetUserId || null,
    targetUserId,
    amount,
    reason,
    metadata,
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 19),
  });
};

const tradingIncomeFilter = {
  type: "trading",
  status: { $in: ["completed", "confirmed", "success"] },
  $or: [{ "metadata.action": { $exists: false } }, { "metadata.action": { $ne: "trade_open" } }],
};

const buildIncomeBaseFilter = () => ({
  type: { $in: INCOME_TYPES },
  status: { $in: ["completed", "confirmed", "success"] },
  $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
});

const isAuditView = (query = {}) => ["raw", "audit"].includes(String(query.view || query.mode || "").toLowerCase());

const getIncomeTransactionTypeFilter = (incomeType = "") => {
  if (incomeType === "referral") return { $in: ["referral", "REFERRAL"] };
  if (incomeType === "level") return { $in: ["level", "LEVEL"] };
  if (incomeType === "salary") return { $in: ["salary", "SALARY"] };
  if (incomeType && INCOME_TYPES.includes(incomeType)) return incomeType;
  return { $in: INCOME_TYPES };
};

const getSum = async (model, match) => {
  const result = await model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  return result[0]?.total || 0;
};

const buildReportingSignedAmountExpr = () => ({
  $let: {
    vars: {
      amount: { $ifNull: ["$amount", 0] },
      direction: { $toLower: { $ifNull: ["$metadata.direction", ""] } },
    },
    in: {
      $cond: [
        { $isNumber: "$metadata.amountSigned" },
        "$metadata.amountSigned",
        {
          $cond: [
            { $isNumber: "$metadata.signedAmount" },
            "$metadata.signedAmount",
            {
              $cond: [
                { $eq: ["$$direction", "debit"] },
                { $multiply: [{ $abs: "$$amount" }, -1] },
                {
                  $cond: [{ $eq: ["$$direction", "credit"] }, { $abs: "$$amount" }, "$$amount"],
                },
              ],
            },
          ],
        },
      ],
    },
  },
});

const buildReportingReconciliationLookupStages = () => [
  {
    $lookup: {
      from: "reconciliationadjustments",
      let: { adjustmentId: "$metadata.adjustmentId" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [{ $toString: "$_id" }, { $ifNull: [{ $toString: "$$adjustmentId" }, ""] }],
            },
          },
        },
        { $project: { status: 1, metadata: 1 } },
      ],
      as: "reconciliationAdjustment",
    },
  },
  {
    $addFields: {
      reconciliationAdjustment: { $arrayElemAt: ["$reconciliationAdjustment", 0] },
    },
  },
];

const buildReportingDecorationStages = () => [
  ...buildReportingReconciliationLookupStages(),
  {
    $addFields: {
      reportingAmountSigned: buildReportingSignedAmountExpr(),
      includeInReporting: {
        $and: [
          { $ne: [{ $ifNull: ["$metadata.excludedFromReporting", false] }, true] },
          { $ne: [{ $ifNull: ["$metadata.duplicateHistorical", false] }, true] },
          {
            $or: [
              { $eq: ["$reconciliationAdjustment", null] },
              {
                $and: [
                  { $eq: [{ $ifNull: ["$reconciliationAdjustment.status", "applied"] }, "applied"] },
                  { $ne: [{ $ifNull: ["$reconciliationAdjustment.metadata.excludedFromReporting", false] }, true] },
                  { $ne: [{ $ifNull: ["$reconciliationAdjustment.metadata.duplicateHistorical", false] }, true] },
                ],
              },
            ],
          },
        ],
      },
    },
  },
];

const getReportingTransactionSum = async (match) => {
  const result = await Transaction.aggregate([
    { $match: match },
    ...buildReportingDecorationStages(),
    { $match: { includeInReporting: true } },
    { $group: { _id: null, total: { $sum: "$reportingAmountSigned" } } },
  ]);
  return result[0]?.total || 0;
};

const getReportingTransactionCount = async (match) => {
  const result = await Transaction.aggregate([
    { $match: match },
    ...buildReportingDecorationStages(),
    { $match: { includeInReporting: true } },
    { $count: "total" },
  ]);
  return Number(result[0]?.total || 0);
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
    ...buildReportingDecorationStages(),
    { $match: { includeInReporting: true } },
    {
      $group: {
        _id: {
          year: { $isoWeekYear: "$createdAt" },
          week: { $isoWeek: "$createdAt" },
        },
        amount: { $sum: "$reportingAmountSigned" },
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
    ...buildReportingDecorationStages(),
    { $match: { includeInReporting: true } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" },
        },
        amount: { $sum: "$reportingAmountSigned" },
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
  const { page = 1, limit = 500, reporting = true } = options;
  const skip = (page - 1) * limit;

  if (!reporting) {
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
  }

  const items = await Transaction.aggregate([
    { $match: query },
    ...buildReportingDecorationStages(),
    { $match: { includeInReporting: true } },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userDoc",
      },
    },
    {
      $addFields: {
        userDoc: { $arrayElemAt: ["$userDoc", 0] },
      },
    },
  ]);

  return items.map((item) => {
    const createdAt = new Date(item.createdAt || new Date());
    return {
      id: item._id,
      userId: item.userDoc?._id?.toString() || null,
      userRef: item.userDoc?.userId || "-",
      userName: item.userDoc?.name || "User",
      incomeType: formatIncomeType(item.type),
      amount: Number(item.reportingAmountSigned || 0),
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

  const [totalUsers, totalActiveUsers, todayJoiningUsers, todayActiveUsers, totalWithdrawals, todayWithdrawals, totalDeposits, todayDeposits] =
    await Promise.all([
      User.countDocuments({}),
      countActivatedUsers(),
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      countActivatedUsers({ createdFrom: start, createdTo: end }),
      getSum(Withdrawal, { status: "completed" }),
      getSum(Withdrawal, { status: "completed", createdAt: { $gte: start, $lte: end } }),
      getSum(Deposit, { status: { $in: ["approved", "confirmed", "completed"] } }),
      getSum(Deposit, { status: { $in: ["approved", "confirmed", "completed"] }, createdAt: { $gte: start, $lte: end } }),
    ]);
  const totalInactiveUsers = Math.max(0, totalUsers - totalActiveUsers);

  const [totalTradingIncome, todayTradingIncome, totalReferralIncome, todayReferralIncome, totalLevelIncome, todayLevelIncome, totalSalaryIncome, todaySalaryIncome] =
    await Promise.all([
      getReportingTransactionSum(tradingIncomeFilter),
      getReportingTransactionSum({ ...tradingIncomeFilter, createdAt: { $gte: start, $lte: end } }),
      getReportingTransactionSum({ type: { $in: ["referral", "REFERRAL"] }, status: { $in: ["completed", "confirmed", "success"] } }),
      getReportingTransactionSum({
        type: { $in: ["referral", "REFERRAL"] },
        status: { $in: ["completed", "confirmed", "success"] },
        createdAt: { $gte: start, $lte: end },
      }),
      getReportingTransactionSum({ type: { $in: ["level", "LEVEL"] }, status: { $in: ["completed", "confirmed", "success"] } }),
      getReportingTransactionSum({
        type: { $in: ["level", "LEVEL"] },
        status: { $in: ["completed", "confirmed", "success"] },
        createdAt: { $gte: start, $lte: end },
      }),
      getReportingTransactionSum({ type: { $in: ["salary", "SALARY"] }, status: { $in: ["completed", "confirmed", "success"] } }),
      getReportingTransactionSum({
        type: { $in: ["salary", "SALARY"] },
        status: { $in: ["completed", "confirmed", "success"] },
        createdAt: { $gte: start, $lte: end },
      }),
    ]);

  const [totalLevelIncomeRaw, todayLevelIncomeRaw] = await Promise.all([
    getSum(Transaction, { type: { $in: ["level", "LEVEL"] }, status: { $in: ["completed", "confirmed", "success"] } }),
    getSum(Transaction, {
      type: { $in: ["level", "LEVEL"] },
      status: { $in: ["completed", "confirmed", "success"] },
      createdAt: { $gte: start, $lte: end },
    }),
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
      totalLevelIncomeRaw,
      todayLevelIncomeRaw,
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
    getDailySeries(Deposit, { status: { $in: ["approved", "confirmed", "completed"] } }, 30),
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

  const sortStage = sortBy === "income" ? { totalIncome: sortOrder, createdAt: -1 } : { createdAt: sortOrder };
  const basePipeline = [
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
              status: { $in: ["completed", "confirmed", "success"] },
              $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
            },
          },
          ...buildReportingDecorationStages(),
          { $match: { includeInReporting: true } },
          { $group: { _id: null, totalIncome: { $sum: "$reportingAmountSigned" } } },
        ],
        as: "incomeAgg",
      },
    },
    {
      $lookup: {
        from: "trades",
        let: { uid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$uid"] },
              status: { $in: ["active", "completed"] },
            },
          },
          { $group: { _id: null, totalInvestment: { $sum: "$amount" } } },
        ],
        as: "tradeAgg",
      },
    },
    {
      $addFields: {
        wallet: { $arrayElemAt: ["$walletArr", 0] },
        referralCount: { $ifNull: [{ $arrayElemAt: ["$referralAgg.count", 0] }, 0] },
        totalIncome: { $ifNull: [{ $arrayElemAt: ["$incomeAgg.totalIncome", 0] }, 0] },
        activationInvestment: { $ifNull: [{ $arrayElemAt: ["$tradeAgg.totalInvestment", 0] }, 0] },
        isActivated: {
          $or: [
            { $eq: ["$isActive", true] },
            { $eq: ["$packageActive", true] },
            { $eq: ["$mlmEligible", true] },
            { $eq: [{ $toLower: { $ifNull: ["$packageStatus", "inactive"] } }, "active"] },
            { $gte: [{ $ifNull: [{ $arrayElemAt: ["$tradeAgg.totalInvestment", 0] }, 0] }, ACTIVATION_MIN_TRADE_AMOUNT] },
          ],
        },
      },
    },
  ];

  const statusPipeline =
    status === "active"
      ? [{ $match: { isActivated: true } }]
      : status === "inactive"
        ? [{ $match: { isActivated: false } }]
        : [];

  const totalRows = await User.aggregate([...basePipeline, ...statusPipeline, { $count: "total" }]);
  const total = Number(totalRows[0]?.total || 0);

  const users = await User.aggregate([
    ...basePipeline,
    ...statusPipeline,
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
        activationInvestment: 1,
        isActivated: 1,
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
      activationInvestment: user.activationInvestment || 0,
      isActivated: Boolean(user.isActivated),
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
      status: { $in: ["completed", "confirmed", "success"] },
      $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
    }),
    buildReferralTree(user, 10, 1),
    User.countDocuments({ referredBy: user._id }),
    Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: { $in: INCOME_TYPES },
          status: { $in: ["completed", "confirmed", "success"] },
          $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
        },
      },
      ...buildReportingDecorationStages(),
      { $match: { includeInReporting: true } },
      { $group: { _id: "$type", total: { $sum: "$reportingAmountSigned" } } },
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
    if (row._id === "referral" || row._id === "REFERRAL") incomeBreakdown.referralIncome += row.total;
    if (row._id === "level" || row._id === "LEVEL") incomeBreakdown.levelIncome += row.total;
    if (row._id === "salary" || row._id === "SALARY") incomeBreakdown.salaryIncome += row.total;
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

export const changeAdminPassword = asyncHandler(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const confirmPassword = req.body.confirmPassword === undefined ? null : String(req.body.confirmPassword || "");

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current password and new password are required");
  }

  if (confirmPassword !== null && confirmPassword !== newPassword) {
    throw new ApiError(400, "Confirm password does not match new password");
  }

  const validCurrent = await req.user.comparePassword(currentPassword);
  if (!validCurrent) {
    throw new ApiError(401, "Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw new ApiError(400, "New password must be different from current password");
  }

  validateStrongPassword(newPassword, "New password");
  await req.user.setPassword(newPassword);
  await req.user.save();

  await addActivityLog({
    adminId: req.user._id,
    type: "admin_password_change",
    action: "Admin changed own password",
    metadata: { adminUserId: req.user.userId },
  });

  res.json({ message: "Password updated successfully" });
});

export const resetUserPasswordByAdmin = asyncHandler(async (req, res) => {
  const target = await findUserByParam(req.params.id);
  const result = await resetUserPasswordByAdminAction({
    actor: req.user,
    target,
    newPassword: req.body.newPassword,
    confirmPassword: req.body.confirmPassword,
    createActivityLogFn: addActivityLog,
  });

  res.json(result);
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
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);
  const wallet = await ensureWallet(user._id);
  wallet.depositWallet += amountValue;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const adminCreditTxn = await Transaction.create({
    userId: user._id,
    type: "admin_transfer",
    amount: amountValue,
    network: "INTERNAL",
    source: reason || "Admin fund transfer",
    status: "completed",
    metadata: { action: "admin_fund_transfer", adminId: req.user._id, reason: reason || "", date, time },
  });

  const { wallet: activatedWallet, trade } = await startTradeAndActivate({
    user,
    amount: amountValue,
    activationSource: "admin_wallet_activation",
  });

  await addActivityLog({
    adminId: req.user._id,
    type: "admin_transfer",
    action: "Fund transferred and user activated",
    targetUserId: user._id,
    amount: amountValue,
    reason: reason || "",
    metadata: { userId: user.userId, tradeId: trade._id, transactionId: adminCreditTxn._id },
  });

  res.json({ message: "Fund transferred and activation completed", wallet: activatedWallet, trade });
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
  await syncTeamBusinessForUserAndUplines(user._id);

  res.json({ message: "Fund deducted successfully", wallet });
});
export const listDeposits = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const query = {};
  if (req.query.status) {
    query.status = String(req.query.status).toLowerCase();
  }

  const [items, total] = await Promise.all([
    Deposit.find(query).populate("userId", "name email userId walletAddress").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Deposit.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const approveDeposit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.depositId)) {
    throw new ApiError(404, "Deposit request not found");
  }

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

  deposit.status = "approved";
  await deposit.save();

  await Promise.all([
    Transaction.findOneAndUpdate(
      { "metadata.depositId": deposit._id, type: "deposit" },
      { status: "completed", source: "Deposit approved by admin" },
      { new: true }
    ),
    addActivityLog({
      adminId: req.user._id,
      type: "deposit_approval",
      action: "Deposit approved",
      targetUserId: user._id,
      amount: deposit.amount,
      metadata: { depositId: deposit._id },
    }),
  ]);

  await syncTeamBusinessForUserAndUplines(user._id);

  res.json({ message: "Deposit approved", deposit, wallet });
});

export const rejectDeposit = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "Rejected by admin").trim();
  if (!mongoose.isValidObjectId(req.params.depositId)) {
    throw new ApiError(404, "Deposit request not found");
  }

  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) throw new ApiError(404, "Deposit request not found");
  if (deposit.status !== "pending") throw new ApiError(400, "Deposit is already processed");

  deposit.status = "rejected";
  await deposit.save();
  await Transaction.findOneAndUpdate(
    { "metadata.depositId": deposit._id, type: "deposit" },
    { status: "failed", source: `Deposit rejected: ${reason}` },
    { new: true }
  );

  await addActivityLog({
    adminId: req.user._id,
    type: "deposit_rejection",
    action: "Deposit rejected",
    targetUserId: deposit.userId,
    amount: deposit.amount,
    reason,
    metadata: { depositId: deposit._id },
  });

  res.json({ message: "Deposit rejected", deposit });
});

export const recheckDepositPaymentStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.depositId)) {
    throw new ApiError(404, "Deposit request not found");
  }

  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) throw new ApiError(404, "Deposit request not found");
  if (!deposit.gateway) {
    throw new ApiError(400, "Deposit is not linked with a live gateway");
  }

  const payload = await adminDepositDeps.getGatewayPaymentStatus({
    gateway: deposit.gateway,
    paymentId: deposit.gatewayPaymentId,
    orderId: deposit.gatewayOrderId || String(deposit._id),
  });
  if (!payload) {
    throw new ApiError(404, "Gateway payment not found");
  }

  const data =
    adminDepositDeps.extractGatewayWebhookData({ gateway: deposit.gateway, payload }) ||
    ({
      gatewayPaymentId: String(payload.payment_id || deposit.gatewayPaymentId || "").trim(),
      gatewayOrderId: String(payload.order_id || deposit.gatewayOrderId || "").trim(),
      gatewayStatus: String(payload.payment_status || payload.status || "").toLowerCase(),
      txHash: String(payload.payin_hash || payload.txhash || payload.txHash || "").trim(),
    });

  if (data.gatewayPaymentId) deposit.gatewayPaymentId = data.gatewayPaymentId;
  if (data.gatewayOrderId) deposit.gatewayOrderId = data.gatewayOrderId;
  if (data.txHash) deposit.txHash = data.txHash;
  deposit.gatewayStatus = String(data.gatewayStatus || deposit.gatewayStatus || "").toLowerCase();
  deposit.webhookPayload = payload;

  const mappedStatus = adminDepositDeps.mapGatewayStatusToDepositStatus(data.gatewayStatus);
  if (adminDepositDeps.isGatewaySuccessFinalStatus(data.gatewayStatus)) {
    const amountValidation = adminDepositDeps.validateReceivedAmountAgainstExpected({
      expectedUsdAmount: deposit.amount,
      payload,
      tolerancePercent: DEPOSIT_AMOUNT_TOLERANCE_PERCENT,
    });

    if (!amountValidation.isWithinTolerance) {
      deposit.status = "pending_review";
      await deposit.save();
      await upsertDepositTransaction({
        deposit,
        status: "pending",
        source: `Gateway recheck amount ${amountValidation.reason}; pending manual review`,
        metadata: {
          gatewayStatus: deposit.gatewayStatus,
          amountValidation,
          txHash: data.txHash,
        },
      });
      await addActivityLog({
        adminId: req.user._id,
        action: "Deposit moved to pending review after gateway recheck",
        type: "deposit_recheck",
        targetUserId: deposit.userId,
        amount: deposit.amount,
        metadata: { depositId: deposit._id, gatewayStatus: deposit.gatewayStatus, amountValidation },
      });
      return res.json({ message: "Deposit moved to pending_review due to amount mismatch", deposit, amountValidation });
    }

    await deposit.save();
    const result = await adminDepositDeps.creditDepositOnce({
      depositId: deposit._id,
      source: "Deposit confirmed after admin gateway recheck",
      gatewayStatus: data.gatewayStatus,
      txHash: data.txHash,
      webhookPayload: payload,
    });
    await addActivityLog({
      adminId: req.user._id,
      action: "Deposit rechecked and credited",
      type: "deposit_recheck",
      targetUserId: deposit.userId,
      amount: deposit.amount,
      metadata: { depositId: deposit._id, gatewayStatus: data.gatewayStatus, credited: result.credited },
    });
    return res.json({ message: "Deposit rechecked", deposit: result.deposit || deposit, credited: result.credited });
  }

  if (mappedStatus === "failed" || mappedStatus === "expired") {
    const updated = await adminDepositDeps.markDepositFailedOrExpired({
      deposit,
      mappedStatus,
      gatewayStatus: data.gatewayStatus,
      txHash: data.txHash,
      webhookPayload: payload,
    });
    await addActivityLog({
      adminId: req.user._id,
      action: "Deposit rechecked and marked non-success",
      type: "deposit_recheck",
      targetUserId: updated.userId,
      amount: updated.amount,
      metadata: { depositId: updated._id, status: updated.status, gatewayStatus: updated.gatewayStatus },
    });
    return res.json({ message: "Deposit rechecked", deposit: updated, credited: false });
  }

  await deposit.save();
  await upsertDepositTransaction({
    deposit,
    status: "pending",
    source: "Gateway recheck pending confirmation",
    metadata: {
      gatewayStatus: deposit.gatewayStatus,
      txHash: data.txHash,
    },
  });
  await addActivityLog({
    adminId: req.user._id,
    action: "Deposit rechecked - still pending",
    type: "deposit_recheck",
    targetUserId: deposit.userId,
    amount: deposit.amount,
    metadata: { depositId: deposit._id, gatewayStatus: deposit.gatewayStatus },
  });

  res.json({ message: "Deposit still pending at gateway", deposit, credited: false });
});

export const manualCreditDeposit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.depositId)) {
    throw new ApiError(404, "Deposit request not found");
  }
  const reason = String(req.body.reason || "Manual credit by admin").trim();
  const deposit = await Deposit.findById(req.params.depositId);
  if (!deposit) throw new ApiError(404, "Deposit request not found");

  const result = await adminDepositDeps.creditDepositOnce({
    depositId: deposit._id,
    source: `Manual deposit credit by admin: ${reason}`,
    gatewayStatus: deposit.gatewayStatus || "manual_credit",
    txHash: deposit.txHash || "",
    webhookPayload: deposit.webhookPayload || { manualCreditReason: reason, byAdmin: String(req.user._id) },
  });

  await addActivityLog({
    adminId: req.user._id,
    action: "Deposit manually credited",
    type: "deposit_manual_credit",
    targetUserId: deposit.userId,
    amount: deposit.amount,
    reason,
    metadata: { depositId: deposit._id, credited: result.credited },
  });

  res.json({
    message: result.credited ? "Deposit manually credited" : "Deposit was already credited",
    deposit: result.deposit || deposit,
    credited: result.credited,
  });
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
  if (!mongoose.isValidObjectId(req.params.tradeId)) {
    throw new ApiError(404, "Trade not found");
  }

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

export const getTradingRoiSetting = asyncHandler(async (_req, res) => {
  const tradingROI = await getTradingRoiPercent();
  res.json({ tradingROI });
});

export const updateTradingRoiSetting = asyncHandler(async (req, res) => {
  const tradingROI = Number(req.body.tradingROI);
  if (!Number.isFinite(tradingROI) || tradingROI <= 0) {
    throw new ApiError(400, "tradingROI must be a valid positive number");
  }

  await setTradingRoiPercent(tradingROI);
  await addActivityLog({
    adminId: req.user._id,
    type: "roi_change",
    action: "Trading ROI changed",
    amount: tradingROI,
    reason: `Global trading ROI updated to ${tradingROI}%`,
    metadata: { tradingROI },
  });

  res.json({ message: "Trading ROI updated", tradingROI });
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
  if (!mongoose.isValidObjectId(tradeId)) {
    throw new ApiError(404, "Trade not found");
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
  if (!mongoose.isValidObjectId(req.params.withdrawalId)) {
    throw new ApiError(404, "Withdrawal request not found");
  }

  const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
  if (!withdrawal) throw new ApiError(404, "Withdrawal request not found");
  if (withdrawal.status !== "pending") throw new ApiError(400, "Withdrawal is already processed");
  const grossAmount = Number(withdrawal.grossAmount || withdrawal.amount || 0);
  const feeAmount = Number(withdrawal.feeAmount || 0);
  const netAmount = Number(withdrawal.netAmount || Math.max(0, grossAmount - feeAmount));
  const chargePercent = Number(withdrawal.chargePercent || 10);

  withdrawal.status = "completed";
  withdrawal.approvedAt = new Date();
  withdrawal.reviewedBy = req.user._id;
  await withdrawal.save();

  await Promise.all([
    Transaction.findOneAndUpdate(
      { "metadata.withdrawalId": withdrawal._id, type: "withdraw" },
      {
        status: "completed",
        source: "Withdrawal approved by admin",
        "metadata.grossAmount": grossAmount,
        "metadata.feeAmount": feeAmount,
        "metadata.netAmount": netAmount,
        "metadata.chargePercent": chargePercent,
      },
      { new: true }
    ),
    addActivityLog({
      adminId: req.user._id,
      action: "Withdrawal approved",
      targetUserId: withdrawal.userId,
      amount: grossAmount,
      metadata: { withdrawalId: withdrawal._id, grossAmount, feeAmount, netAmount, chargePercent },
    }),
  ]);

  res.json({ message: "Withdrawal marked as completed", withdrawal });
});

export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "Rejected by admin").trim();
  if (!mongoose.isValidObjectId(req.params.withdrawalId)) {
    throw new ApiError(404, "Withdrawal request not found");
  }

  const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
  if (!withdrawal) throw new ApiError(404, "Withdrawal request not found");
  if (withdrawal.status !== "pending") throw new ApiError(400, "Withdrawal is already processed");
  const grossAmount = Number(withdrawal.grossAmount || withdrawal.amount || 0);
  const feeAmount = Number(withdrawal.feeAmount || 0);
  const netAmount = Number(withdrawal.netAmount || Math.max(0, grossAmount - feeAmount));
  const chargePercent = Number(withdrawal.chargePercent || 10);

  const wallet = await Wallet.findOne({ userId: withdrawal.userId });
  if (!wallet) throw new ApiError(404, "Wallet not found for withdrawal user");

  wallet.withdrawalWallet += grossAmount;
  wallet.withdrawTotal = Math.max(0, wallet.withdrawTotal - grossAmount);
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  withdrawal.status = "rejected";
  withdrawal.reviewedBy = req.user._id;
  withdrawal.rejectionReason = reason;
  await withdrawal.save();

  await Promise.all([
    Transaction.findOneAndUpdate(
      { "metadata.withdrawalId": withdrawal._id, type: "withdraw" },
      {
        status: "failed",
        source: `Withdrawal rejected: ${reason}`,
        "metadata.grossAmount": grossAmount,
        "metadata.feeAmount": feeAmount,
        "metadata.netAmount": netAmount,
        "metadata.chargePercent": chargePercent,
      },
      { new: true }
    ),
    addActivityLog({
      adminId: req.user._id,
      action: "Withdrawal rejected",
      targetUserId: withdrawal.userId,
      amount: grossAmount,
      reason,
      metadata: { withdrawalId: withdrawal._id, grossAmount, feeAmount, netAmount, chargePercent },
    }),
  ]);

  res.json({ message: "Withdrawal rejected and amount refunded", withdrawal, wallet });
});
export const listTransactionsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const auditView = isAuditView(req.query);
  const query = {};
  if (req.query.type) {
    const type = String(req.query.type).toLowerCase();
    if (type === "referral") {
      query.type = { $in: ["referral", "REFERRAL"] };
    } else if (type === "level") {
      query.type = { $in: ["level", "LEVEL"] };
    } else if (type === "salary") {
      query.type = { $in: ["salary", "SALARY"] };
    } else {
      query.type = String(req.query.type);
    }
  }
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.userId) {
    const user = await findUserByParam(req.query.userId);
    if (!user) throw new ApiError(404, "User not found");
    query.userId = user._id;
  }

  let items = [];
  let total = 0;

  if (!auditView) {
    const [rows, count] = await Promise.all([
      Transaction.aggregate([
        { $match: query },
        ...buildReportingDecorationStages(),
        { $match: { includeInReporting: true } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userDoc",
          },
        },
        {
          $addFields: {
            userId: { $arrayElemAt: ["$userDoc", 0] },
            amount: "$reportingAmountSigned",
          },
        },
      ]),
      getReportingTransactionCount(query),
    ]);
    items = rows;
    total = count;
  } else {
    [items, total] = await Promise.all([
      Transaction.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(query),
    ]);
  }

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getIncomeHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const auditView = isAuditView(req.query);
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

  const canonicalTxQuery = {
    type: getIncomeTransactionTypeFilter(incomeType),
    status: { $in: ["completed", "confirmed", "success"] },
    $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
  };
  if (incomeLogQuery.userId) canonicalTxQuery.userId = incomeLogQuery.userId;

  if (!auditView) {
    const [total, items] = await Promise.all([
      getReportingTransactionCount(canonicalTxQuery),
      listIncomeTransactions(canonicalTxQuery, { page, limit, reporting: true }),
    ]);
    return res.json({
      items,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  }

  const [items, total] = await Promise.all([
    IncomeLog.find(incomeLogQuery).populate("userId", "name email userId").sort({ recordedAt: -1 }).skip(skip).limit(limit),
    IncomeLog.countDocuments(incomeLogQuery),
  ]);

  if (total > 0) {
    return res.json({
      items: items.map((item) => {
        const createdAt = new Date(item.recordedAt || item.createdAt || new Date());
        return {
          id: item._id,
          userId: item.userId?._id?.toString() || null,
          userRef: item.userId?.userId || "-",
          userName: item.userId?.name || "User",
          incomeType: formatIncomeType(item.incomeType),
          amount: Number(item.amount || 0),
          source: item.source || "System income",
          date: createdAt.toISOString().slice(0, 10),
          time: createdAt.toISOString().slice(11, 19),
          createdAt,
        };
      }),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  }

  const [fallbackTotal, fallbackItems] = await Promise.all([
    Transaction.countDocuments(canonicalTxQuery),
    listIncomeTransactions(canonicalTxQuery, { page, limit, reporting: false }),
  ]);
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

export const listSupportQueriesAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim().toLowerCase();

  const query = {};
  if (["pending", "approved", "rejected"].includes(status)) {
    query.status = status;
  }

  if (search) {
    const users = await User.find({
      $or: [{ userId: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { name: { $regex: search, $options: "i" } }],
    }).select("_id");
    const userIds = users.map((user) => user._id);
    query.$or = [{ subject: { $regex: search, $options: "i" } }, { message: { $regex: search, $options: "i" } }];
    if (userIds.length) {
      query.$or.push({ userId: { $in: userIds } });
    }
  }

  const [items, total] = await Promise.all([
    SupportQuery.find(query).populate("userId", "name email userId").sort({ createdAt: -1 }).skip(skip).limit(limit),
    SupportQuery.countDocuments(query),
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const replySupportQueryAdmin = asyncHandler(async (req, res) => {
  const adminReply = String(req.body.adminReply || "").trim();
  if (!adminReply) {
    throw new ApiError(400, "adminReply is required");
  }

  if (!mongoose.isValidObjectId(req.params.queryId)) {
    throw new ApiError(404, "Support query not found");
  }

  const item = await SupportQuery.findById(req.params.queryId);
  if (!item) {
    throw new ApiError(404, "Support query not found");
  }

  item.adminReply = adminReply;
  await item.save();

  await addActivityLog({
    adminId: req.user._id,
    type: "support_reply",
    action: "Support query replied",
    targetUserId: item.userId,
    reason: adminReply,
    metadata: { supportQueryId: item._id },
  });

  res.json({ message: "Reply saved", item });
});

export const approveSupportQueryAdmin = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.queryId)) {
    throw new ApiError(404, "Support query not found");
  }

  const item = await SupportQuery.findById(req.params.queryId);
  if (!item) {
    throw new ApiError(404, "Support query not found");
  }

  item.status = "approved";
  await item.save();

  await addActivityLog({
    adminId: req.user._id,
    type: "support_approve",
    action: "Support query approved",
    targetUserId: item.userId,
    metadata: { supportQueryId: item._id },
  });

  res.json({ message: "Support query approved", item });
});

export const rejectSupportQueryAdmin = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.queryId)) {
    throw new ApiError(404, "Support query not found");
  }

  const item = await SupportQuery.findById(req.params.queryId);
  if (!item) {
    throw new ApiError(404, "Support query not found");
  }

  item.status = "rejected";
  await item.save();

  await addActivityLog({
    adminId: req.user._id,
    type: "support_reject",
    action: "Support query rejected",
    targetUserId: item.userId,
    metadata: { supportQueryId: item._id },
  });

  res.json({ message: "Support query rejected", item });
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

export const getUserCapCycleDebug = asyncHandler(async (req, res) => {
  const userRef = String(req.query.userId || req.params.id || "").trim();
  if (!userRef) {
    throw new ApiError(400, "userId is required");
  }

  const diagnostics = await getUserCapCycleDiagnostics({ userRef });
  if (!diagnostics) {
    throw new ApiError(404, "User not found");
  }

  res.json({
    message: "Cap-cycle diagnostics generated",
    diagnostics,
  });
});

