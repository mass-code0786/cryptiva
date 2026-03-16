import api from "./api";

export type AdminPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type AdminEntityUser = {
  _id?: string;
  name?: string;
  email?: string;
  userId?: string;
  walletAddress?: string;
} | null;

export type DashboardPoint = {
  label: string;
  value: number;
};

export type AdminDashboardOverview = {
  users: {
    totalUsers: number;
    totalActiveUsers: number;
    totalInactiveUsers: number;
    todayJoiningUsers: number;
    todayActiveUsers: number;
  };
  income: {
    totalTradingIncome: number;
    todayTradingIncome: number;
    totalReferralIncome: number;
    todayReferralIncome: number;
    totalLevelIncome: number;
    todayLevelIncome: number;
    totalSalaryIncome: number;
    todaySalaryIncome: number;
  };
  finance: {
    totalWithdrawals: number;
    todayWithdrawals: number;
    totalDeposits: number;
    todayDeposits: number;
  };
};

export type AdminDashboardAnalytics = {
  dailyTradingIncome: DashboardPoint[];
  weeklyIncome: DashboardPoint[];
  monthlyIncome: DashboardPoint[];
  userGrowth: DashboardPoint[];
  withdrawalChart: DashboardPoint[];
  depositChart: DashboardPoint[];
};

export type AdminUserItem = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role?: "admin" | "user";
  isAdmin?: boolean;
  referralCode?: string;
  walletAddress?: string;
  createdAt: string;
  lastLoginAt?: string | null;
  isBlocked?: boolean;
  referralCount?: number;
  walletBalance?: number;
  tradingBalance?: number;
  totalIncome?: number;
};

export type AdminUserProfile = {
  user: AdminUserItem;
  wallet?: {
    balance: number;
    depositWallet: number;
    withdrawalWallet: number;
    tradingBalance: number;
    depositTotal?: number;
    withdrawTotal?: number;
  } | null;
  incomeBreakdown: {
    tradingIncome: number;
    referralIncome: number;
    levelIncome: number;
    salaryIncome: number;
  };
  referralTree: AdminReferralNode[];
  incomeHistory: AdminIncomeHistoryItem[];
};

export type AdminReferralNode = {
  id: string;
  userId: string;
  name: string;
  email: string;
  level?: number;
  children: AdminReferralNode[];
};

export type AdminReferralTreeResponse = {
  rootUser: {
    id: string;
    userId: string;
    name: string;
    email: string;
  };
  depth: number;
  totalDescendants: number;
  levels: Array<{
    level: number;
    users: Array<{
      id: string;
      userId: string;
      name: string;
      email: string;
    }>;
  }>;
  tree: AdminReferralNode[];
};

export type AdminIncomeHistoryItem = {
  id: string;
  userId: string | null;
  userRef: string;
  userName: string;
  incomeType: string;
  amount: number;
  source: string;
  date: string;
  time: string;
  createdAt: string;
};

export type AdminDepositItem = {
  _id: string;
  amount: number;
  currency: string;
  network: string;
  status: "pending" | "approved" | "rejected" | "confirmed" | "failed";
  createdAt: string;
  txHash?: string;
  userId?: AdminEntityUser;
  payment?: {
    pay_address?: string;
  };
};

export type AdminWithdrawalItem = {
  _id: string;
  amount: number;
  destination: string;
  network: string;
  currency: string;
  status: "pending" | "completed" | "rejected";
  createdAt: string;
  userId?: AdminEntityUser;
  user?: {
    name?: string;
    email?: string;
    userId?: string;
  };
};

export type AdminTradeItem = {
  _id: string;
  amount: number;
  totalIncome: number;
  capping: number;
  investmentLimit: number;
  manualRoiRate?: number | null;
  status: "active" | "completed";
  createdAt: string;
  userId?: AdminEntityUser;
};

export type AdminActivityLogItem = {
  _id: string;
  action: string;
  amount?: number | null;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  adminId?: AdminEntityUser;
  targetUserId?: AdminEntityUser;
};

export type AdminSupportQueryItem = {
  _id: string;
  subject: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
  userId?: AdminEntityUser;
};

export const fetchAdminDashboardOverview = () => api.get<AdminDashboardOverview>("/admin/dashboard-overview");
export const fetchAdminDashboardAnalytics = () => api.get<AdminDashboardAnalytics>("/admin/dashboard-analytics");
export const fetchAdminTradingRoiSetting = () => api.get<{ tradingROI: number }>("/admin/settings/trading-roi");
export const updateAdminTradingRoiSetting = (tradingROI: number) => api.patch("/admin/settings/trading-roi", { tradingROI });

export const fetchAdminUsers = (params?: {
  search?: string;
  status?: "all" | "active" | "inactive";
  sortBy?: "joinDate" | "income";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}) => api.get<{ items: AdminUserItem[]; pagination: AdminPagination }>("/admin/users", { params });

export const fetchAdminUserProfile = (id: string) => api.get<AdminUserProfile>(`/admin/users/${id}`);
export const fetchAdminReferralTree = (params?: { userId?: string; depth?: number }) =>
  api.get<AdminReferralTreeResponse>("/admin/referral-tree", { params });

export const blockAdminUser = (id: string) => api.patch(`/admin/users/${id}/block`);
export const unblockAdminUser = (id: string) => api.patch(`/admin/users/${id}/unblock`);

export const transferAdminFund = (payload: { userId: string; amount: number; reason: string }) =>
  api.post("/admin/fund-transfer", payload);
export const deductAdminFund = (payload: { userId: string; amount: number; reason: string }) =>
  api.post("/admin/fund-deduct", payload);

export const fetchAdminDeposits = (params?: { status?: string; page?: number; limit?: number }) =>
  api.get<{ items: AdminDepositItem[]; pagination: AdminPagination }>("/admin/deposits", { params });
export const approveAdminDeposit = (depositId: string) => api.patch(`/admin/deposits/${depositId}/approve`);
export const rejectAdminDeposit = (depositId: string, reason: string) => api.patch(`/admin/deposits/${depositId}/reject`, { reason });

export const fetchAdminWithdrawals = (params?: { status?: string; page?: number; limit?: number }) =>
  api.get<{ items: AdminWithdrawalItem[]; pagination: AdminPagination }>("/admin/withdrawals", { params });
export const approveAdminWithdrawal = (withdrawalId: string) => api.patch(`/admin/withdrawals/${withdrawalId}/approve`);
export const rejectAdminWithdrawal = (withdrawalId: string, reason: string) =>
  api.patch(`/admin/withdrawals/${withdrawalId}/reject`, { reason });

export const fetchAdminTrades = (params?: { status?: "active" | "completed"; userId?: string; page?: number; limit?: number }) =>
  api.get<{ items: AdminTradeItem[]; pagination: AdminPagination }>("/admin/trades", { params });

export const adjustAdminTradeIncome = (payload: { tradeId: string; action: "increase" | "decrease"; amount: number; reason: string }) =>
  api.post("/admin/trading/adjust-income", payload);
export const updateAdminTradeProfitRate = (tradeId: string, profitPercentage: number) =>
  api.patch(`/admin/trading/${tradeId}/profit-rate`, { profitPercentage });

export const fetchAdminIncomeHistory = (params?: { search?: string; incomeType?: string; page?: number; limit?: number }) =>
  api.get<{ items: AdminIncomeHistoryItem[]; pagination: AdminPagination }>("/admin/income-history", { params });

export const fetchAdminActivityLogs = (params?: { search?: string; page?: number; limit?: number }) =>
  api.get<{ items: AdminActivityLogItem[]; pagination: AdminPagination }>("/admin/activity-logs", { params });

export const fetchAdminSupportQueries = (params?: { search?: string; status?: "pending" | "approved" | "rejected"; page?: number; limit?: number }) =>
  api.get<{ items: AdminSupportQueryItem[]; pagination: AdminPagination }>("/admin/support-queries", { params });
export const replyAdminSupportQuery = (queryId: string, adminReply: string) => api.patch(`/admin/support-queries/${queryId}/reply`, { adminReply });
export const approveAdminSupportQuery = (queryId: string) => api.patch(`/admin/support-queries/${queryId}/approve`);
export const rejectAdminSupportQuery = (queryId: string) => api.patch(`/admin/support-queries/${queryId}/reject`);
