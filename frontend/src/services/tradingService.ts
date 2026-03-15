import api from "./api";

export const createTradeRequest = (payload: { amount: number }) => api.post("/trade/place", payload);
export const fetchActiveTradesRequest = () => api.get("/trade/status");
