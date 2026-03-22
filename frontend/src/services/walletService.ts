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
  isWorkingUser?: boolean;
  capMultiplier?: number;
  currentCapAmount?: number;
  totalIncomeCounted?: number;
  remainingCap?: number;
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
    | "admin_transfer"
    | "trade_start"
    | "TRADE_START"
    | "trade_close"
    | "TRADE_CLOSE";
  amount: number;
  network: "BEP20" | "INTERNAL";
  source: string;
  status: "pending" | "confirmed" | "completed" | "failed" | "success";
  metadata?: {
    depositId?: string;
    requestedCreditAmount?: number;
    creditedAmount?: number;
    expectedPayAmount?: number;
    expectedPayCurrency?: string;
    gatewayFeeAmount?: number;
    gatewayFeeCurrency?: string;
    [key: string]: unknown;
  };
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

export const fetchWallet = () => api.get<{ wallet: Wallet }>("/wallet");
export const fetchTransactions = () => api.get<TransactionsResponse>("/transactions");
