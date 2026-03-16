import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isAdminUser } from "../utils/isAdminUser";

const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  if (!isAdminUser(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

export default AdminRoute;
