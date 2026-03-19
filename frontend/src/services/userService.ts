import api from "./api";

export type SalaryProgress = {
  currentRank: string;
  currentRankNumber?: number;
  nextRank: string;
  nextRankTarget?: string;
  mainLegBusiness: number;
  otherLegBusiness: number;
  remainingMainLeg: number;
  remainingOtherLeg: number;
  remainingBusiness?: number;
  weeklySalary: number;
  salaryAmountForRank?: number;
  qualificationActive?: boolean;
  progressPercentage: number;
};

export const fetchMyProfile = () => api.get("/users/me");
export const updateMyProfile = (payload: { name?: string; walletAddress?: string }) =>
  api.patch("/users/me", payload);
export const changeMyPassword = (payload: { currentPassword: string; newPassword: string; confirmPassword?: string }) =>
  api.patch("/users/change-password", payload);
export const updateMyReferralCode = (payload: { referralCode: string }) =>
  api.patch("/users/referral-code", payload);
export const fetchTeamReferrals = () => api.get<TeamReferralsResponse>("/referrals");

export type TeamReferralsResponse = {
  referrals: Array<{
    _id: string;
    level: number;
    status?: "active" | "inactive";
    investment?: number;
    joinedAt?: string;
    fromUser?: {
      name?: string;
      email?: string;
      userId?: string;
    };
  }>;
  totalDirectTeam?: number;
  totalLevelTeam?: number;
  levelCounts?: Array<{
    level: number;
    total: number;
    active: number;
    inactive: number;
  }>;
};

export type ReferralIncomeHistoryItem = {
  id: string;
  incomeType: "direct" | "level";
  level: number;
  amount: number;
  timestamp: string;
  receiverUserId: string;
  receiverName?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  sourceUserSponsorId?: string;
  tradeId?: string | null;
  roiEventKey?: string;
  roiCreditTransactionId?: string;
  metadata?: Record<string, unknown>;
};

export type ReferralIncomeHistoryResponse = {
  items: ReferralIncomeHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export const fetchReferralIncomeHistory = (params?: { incomeType?: "direct" | "level"; page?: number; limit?: number }) =>
  api.get<ReferralIncomeHistoryResponse>("/referrals/income-history", { params });
export const bindWalletAddress = (payload: { walletAddress: string; network?: "BEP20" }) =>
  api.post("/users/wallet-binding", payload);
export const fetchWalletBinding = () => api.get("/users/wallet-binding");
export const fetchSalaryProgress = () => api.get<SalaryProgress>("/salary-progress");
export const lookupUserByUserId = (userId: string) => api.get<{ user: { id: string; userId: string; name: string } }>(`/users/lookup/${userId}`);
