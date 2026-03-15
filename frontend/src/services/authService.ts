import api from "./api";

export const registerRequest = (payload: {
  name: string;
  email: string;
  password: string;
  pin: string;
  referralCode?: string;
}) => api.post("/auth/register", payload);

export const loginRequest = (payload: { email: string; password: string }) =>
  api.post("/auth/login", payload);

