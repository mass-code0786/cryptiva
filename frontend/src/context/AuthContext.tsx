import { ReactNode, createContext, useMemo, useState } from "react";
import { loginRequest, registerRequest } from "../services/authService";

type AuthUser = {
  id: string;
  userId?: string;
  name: string;
  email: string;
  role?: "admin" | "user";
  isAdmin?: boolean;
  referralCode?: string;
  walletAddress?: string;
};

type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  pin: string;
  referralCode?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  refreshUser: (user: AuthUser) => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<AuthUser | null>(JSON.parse(localStorage.getItem("user") || "null"));

  const login = async (email: string, password: string) => {
    const { data } = await loginRequest({ email, password });
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user as AuthUser;
  };

  const register = async (payload: RegisterPayload) => {
    const { data } = await registerRequest(payload);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user as AuthUser;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  const refreshUser = (nextUser: AuthUser) => {
    setUser(nextUser);
    localStorage.setItem("user", JSON.stringify(nextUser));
  };

  const value = useMemo(
    () => ({ user, token, login, register, refreshUser, logout }),
    [user, token]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
