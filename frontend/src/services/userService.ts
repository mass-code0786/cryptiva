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
export const updateMyReferralCode = (payload: { referralCode: string }) =>
  api.patch("/users/referral-code", payload);
export const fetchTeamReferrals = () => api.get("/referrals");
export const bindWalletAddress = (payload: { walletAddress: string; network?: "BEP20" }) =>
  api.post("/users/wallet-binding", payload);
export const fetchWalletBinding = () => api.get("/users/wallet-binding");
export const fetchSalaryProgress = () => api.get<SalaryProgress>("/salary-progress");
export const lookupUserByUserId = (userId: string) => api.get<{ user: { id: string; userId: string; name: string } }>(`/users/lookup/${userId}`);
