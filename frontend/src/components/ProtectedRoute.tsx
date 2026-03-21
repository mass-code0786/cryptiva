import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isAdminUser } from "../utils/isAdminUser";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { token, user } = useAuth();
  const location = useLocation();

  if (!token) return <Navigate to="/login" replace />;
  if (user?.forcePasswordChange && !isAdminUser(user) && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace state={{ forcePasswordChange: true }} />;
  }
  return <>{children}</>;
};

export default ProtectedRoute;
