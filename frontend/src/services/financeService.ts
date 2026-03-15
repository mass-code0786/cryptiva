import api from "./api";

export const createDepositRequest = (payload: { amount: number; currency?: string }) =>
  api.post("/deposit/create", payload);

export const createWithdrawalRequest = (payload: { amount: number; pin: string }) =>
  api.post("/withdrawals", payload);

export const sendP2PRequest = (payload: { receiverEmail: string; amount: number; note?: string }) =>
  api.post("/p2p/send", payload);

export const transferToDepositWalletRequest = (payload: { amount: number }) =>
  api.post("/wallet/transfer", payload);
