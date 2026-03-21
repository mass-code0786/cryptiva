import api from "./api";

export type Wallet = {
  userId: string;
  depositWallet: number;
  withdrawalWallet: number;
  balance: number;
  tradingWallet: number;
  tradingBalance?: number;
  tradingIncome?: number;
  referralIncome?: number;
  levelIncome?: number;
  salaryIncome?: number;
  totalIncome?: number;
  depositTotal: number;
  withdrawTotal: number;
  p2pTotal: number;
};

export type TransactionItem = {
  _id: string;
  userId: string;
  type:
    | "deposit"
    | "withdraw"
    | "trading"
    | "referral"
    | "REFERRAL"
    | "level"
    | "LEVEL"
    | "salary"
    | "SALARY"
    | "p2p"
    | "p2p_transfer"
    | "p2p_receive"
    | "P2P_TRANSFER"
    | "P2P_RECEIVE"
    | "wallet_transfer"
    | "admin_transfer";
  amount: number;
  network: "BEP20" | "INTERNAL";
  source: string;
  status: "pending" | "confirmed" | "completed" | "failed" | "success";
  createdAt: string;
};

export type TransactionsResponse = {
  items: TransactionItem[];
  summary?: {
    totalWithdrawalCompleted?: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export const fetchWallet = () => api.get("/wallet");
export const fetchTransactions = () => api.get<TransactionsResponse>("/transactions");
