import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isAdminUser } from "../utils/isAdminUser";

const RoleRedirect = () => {
  const { user } = useAuth();
  if (isAdminUser(user)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

export default RoleRedirect;
