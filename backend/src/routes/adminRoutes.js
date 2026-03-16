import express from "express";

import {
  adjustTradeIncome,
  approveDeposit,
  approveWithdrawal,
  blockUser,
  deductFund,
  getDashboardAnalytics,
  getDashboardOverview,
  getIncomeHistory,
  getReferralTreeAdmin,
  getUserProfileDetail,
  getTeamBusiness,
  listActivityLogs,
  listDeposits,
  listTrades,
  listTransactionsAdmin,
  listUsers,
  listWithdrawals,
  rejectDeposit,
  rejectWithdrawal,
  transferFund,
  unblockUser,
  updateTradeProfitRate,
} from "../controllers/adminController.js";
import { checkAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate, checkAdmin);
router.get("/dashboard-overview", getDashboardOverview);
router.get("/dashboard-analytics", getDashboardAnalytics);
router.get("/users", listUsers);
router.get("/users/:id", getUserProfileDetail);
router.get("/referral-tree", getReferralTreeAdmin);
router.patch("/users/:id/block", blockUser);
router.patch("/users/:id/unblock", unblockUser);
router.post("/fund-transfer", transferFund);
router.post("/fund-deduct", deductFund);
router.get("/deposits", listDeposits);
router.patch("/deposits/:depositId/approve", approveDeposit);
router.patch("/deposits/:depositId/reject", rejectDeposit);
router.get("/withdrawals", listWithdrawals);
router.patch("/withdrawals/:withdrawalId/approve", approveWithdrawal);
router.patch("/withdrawals/:withdrawalId/reject", rejectWithdrawal);
router.get("/trades", listTrades);
router.post("/trading/adjust-income", adjustTradeIncome);
router.patch("/trading/:tradeId/profit-rate", updateTradeProfitRate);
router.get("/income-history", getIncomeHistory);
router.get("/activity-logs", listActivityLogs);
router.get("/transactions", listTransactionsAdmin);
router.get("/team-business", getTeamBusiness);

export default router;
