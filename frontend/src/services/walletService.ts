import api from "./api";

export type Wallet = {
  userId: string;
  depositWallet: number;
  withdrawalWallet: number;
  balance: number;
  tradingWallet: number;
  tradingBalance?: number;
  depositTotal: number;
  withdrawTotal: number;
  p2pTotal: number;
};

export type TransactionItem = {
  _id: string;
  userId: string;
  type: "deposit" | "withdraw" | "trading" | "referral" | "level" | "salary" | "p2p" | "wallet_transfer" | "admin_transfer";
  amount: number;
  network: "BEP20" | "INTERNAL";
  source: string;
  status: "pending" | "confirmed" | "completed" | "failed";
  createdAt: string;
};

export const fetchWallet = () => api.get("/wallet");
export const fetchTransactions = () => api.get("/transactions");
