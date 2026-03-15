import api from "./api";

export type AdminWithdrawalItem = {
  _id: string;
  amount: number;
  destination: string;
  network: "BEP20";
  currency: "USDT";
  status: "pending" | "completed" | "rejected";
  createdAt: string;
  user?: {
    name?: string;
    email?: string;
    userId?: string;
  };
};

export const fetchAdminWithdrawals = () =>
  api.get<{ items: AdminWithdrawalItem[]; total: number; page: number; limit: number }>("/admin/withdrawals");

export const approveAdminWithdrawal = (withdrawalId: string) =>
  api.patch(`/admin/withdrawals/${withdrawalId}/approve`);

