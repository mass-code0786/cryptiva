import { ReactNode } from "react";
import { Navigate } from "react-router-dom";

type AdminUser = {
  role?: string;
  isAdmin?: boolean;
} | null;

type AdminRouteProps = {
  children: ReactNode;
  user: AdminUser;
};

export default function AdminRoute({ children, user }: AdminRouteProps) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "admin" || user.isAdmin === true) {
    return <>{children}</>;
  }

  return <Navigate to="/dashboard" replace />;
}
