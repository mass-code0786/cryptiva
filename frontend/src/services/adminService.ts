import api from "./api";

export type AdminPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type AdminUserItem = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role?: "admin" | "user";
  isAdmin?: boolean;
  referralCode?: string;
  createdAt: string;
};

export type AdminEntityUser = {
  _id?: string;
  name?: string;
  email?: string;
  userId?: string;
} | null;

export type AdminDepositItem = {
  _id: string;
  amount: number;
  currency: string;
  network: string;
  status: "pending" | "confirmed" | "failed";
  createdAt: string;
  txHash?: string;
  userId?: AdminEntityUser;
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
  status: "active" | "completed";
  createdAt: string;
  userId?: AdminEntityUser;
};

export const fetchAdminUsers = () =>
  api.get<{ items: AdminUserItem[]; pagination: AdminPagination }>("/admin/users");

export const fetchAdminDeposits = () =>
  api.get<{ items: AdminDepositItem[]; total: number; page: number; limit: number; pagination: AdminPagination }>(
    "/admin/deposits"
  );

export const approveAdminDeposit = (depositId: string) => api.patch(`/admin/deposits/${depositId}/approve`);

export const fetchAdminWithdrawals = () =>
  api.get<{ items: AdminWithdrawalItem[]; total: number; page: number; limit: number; pagination: AdminPagination }>(
    "/admin/withdrawals"
  );

export const approveAdminWithdrawal = (withdrawalId: string) => api.patch(`/admin/withdrawals/${withdrawalId}/approve`);

export const fetchAdminTrades = () =>
  api.get<{ items: AdminTradeItem[]; total: number; page: number; limit: number; pagination: AdminPagination }>(
    "/admin/trades"
  );
