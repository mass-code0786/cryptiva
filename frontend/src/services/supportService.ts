import api from "./api";

export type SupportQueryStatus = "pending" | "approved" | "rejected";

export type SupportQueryItem = {
  _id: string;
  userId:
    | string
    | {
        _id?: string;
        userId?: string;
        name?: string;
        email?: string;
      };
  subject: string;
  message: string;
  status: SupportQueryStatus;
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
};

export const createSupportQuery = (payload: { subject: string; message: string }) => api.post("/support/create", payload);
export const fetchMySupportQueries = () => api.get<{ items: SupportQueryItem[] }>("/support/my-queries");
