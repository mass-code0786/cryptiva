import { Navigate, Route, Routes } from "react-router-dom";
import AdminRoute from "./components/AdminRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRedirect from "./components/RoleRedirect";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminDepositsPage from "./pages/admin/AdminDepositsPage";
import AdminTradesPage from "./pages/admin/AdminTradesPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminWithdrawalsPage from "./pages/admin/AdminWithdrawalsPage";
import DashboardPage from "./pages/DashboardPage";
import DepositPage from "./pages/DepositPage";
import LoginPage from "./pages/LoginPage";
import P2PPage from "./pages/P2PPage";
import ProfilePage from "./pages/ProfilePage";
import ReferralsPage from "./pages/ReferralsPage";
import RegisterPage from "./pages/RegisterPage";
import TradingPage from "./pages/TradingPage";
import TransactionsPage from "./pages/TransactionsPage";
import TransferFundsPage from "./pages/TransferFundsPage";
import WithdrawalPage from "./pages/WithdrawalPage";

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><RoleRedirect /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/trading" element={<ProtectedRoute><TradingPage /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><ReferralsPage /></ProtectedRoute>} />
      <Route path="/referrals" element={<Navigate to="/team" replace />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="deposits" element={<AdminDepositsPage />} />
        <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
        <Route path="trades" element={<AdminTradesPage />} />
      </Route>
      <Route path="/history" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
      <Route path="/transactions" element={<Navigate to="/history" replace />} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/p2p" element={<ProtectedRoute><P2PPage /></ProtectedRoute>} />
      <Route path="/deposit" element={<ProtectedRoute><DepositPage /></ProtectedRoute>} />
      <Route path="/withdraw" element={<ProtectedRoute><WithdrawalPage /></ProtectedRoute>} />
      <Route path="/wallet-transfer" element={<ProtectedRoute><TransferFundsPage /></ProtectedRoute>} />
      <Route path="/withdrawal" element={<Navigate to="/withdraw" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
