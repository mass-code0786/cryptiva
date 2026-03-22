import api from "./api";

export type CreateDepositResponse = {
  message: string;
  status: string;
  paymentUrl?: string;
  payAddress?: string;
  qrData?: string;
  requestedCreditAmount?: number | null;
  expectedPayAmount?: number | null;
  expectedPayCurrency?: string;
  gatewayFeeAmount?: number | null;
  gatewayFeeCurrency?: string;
  feeHandlingMode?: string;
  deposit?: {
    _id: string;
    amount: number;
    requestedCreditAmount?: number | null;
    expectedPayAmount?: number | null;
    expectedPayCurrency?: string;
    gatewayFeeAmount?: number | null;
    gatewayFeeCurrency?: string;
    paymentUrl?: string;
    payAddress?: string;
    qrData?: string;
    payment?: {
      payment_url?: string;
      pay_address?: string;
      qr_code_url?: string;
    };
  };
};

export const createDepositRequest = (payload: { amount: number; currency?: string }) =>
  api.post<CreateDepositResponse>("/deposits/create-live", payload);

export const createWithdrawalRequest = (payload: { amount: number; pin: string }) =>
  api.post("/withdrawals", payload);

export const sendP2PRequest = (payload: { receiverUserId: string; amount: number; note?: string }) =>
  api.post("/p2p/send", payload);

export const transferToDepositWalletRequest = (payload: { amount: number }) =>
  api.post("/wallet/transfer", payload);
