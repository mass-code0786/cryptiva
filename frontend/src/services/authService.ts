import api from "./api";

export const registerRequest = (payload: {
  name: string;
  username: string;
  email: string;
  password: string;
  pin: string;
  referralCode?: string;
}) => api.post("/auth/register", payload);

export const loginRequest = (payload: { username: string; password: string }) =>
  api.post("/auth/login", payload);
