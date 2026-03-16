import express from "express";

import {
  approveDeposit,
  approveWithdrawal,
  getTeamBusiness,
  listDeposits,
  listTransactionsAdmin,
  listUsers,
  listWithdrawals,
  rejectDeposit,
  rejectWithdrawal,
} from "../controllers/adminController.js";
import { requireAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get("/users", listUsers);
router.get("/deposits", listDeposits);
router.patch("/deposits/:depositId/approve", approveDeposit);
router.patch("/deposits/:depositId/reject", rejectDeposit);
router.get("/withdrawals", listWithdrawals);
router.patch("/withdrawals/:withdrawalId/approve", approveWithdrawal);
router.patch("/withdrawals/:withdrawalId/reject", rejectWithdrawal);
router.get("/transactions", listTransactionsAdmin);
router.get("/team-business", getTeamBusiness);

export default router;
