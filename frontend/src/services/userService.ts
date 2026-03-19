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
export const bindWalletAddress = (payload: { walletAddress: string; network?: "BEP20" }) =>
  api.post("/users/wallet-binding", payload);
export const fetchWalletBinding = () => api.get("/users/wallet-binding");
export const fetchSalaryProgress = () => api.get<SalaryProgress>("/salary-progress");
export const lookupUserByUserId = (userId: string) => api.get<{ user: { id: string; userId: string; name: string } }>(`/users/lookup/${userId}`);
