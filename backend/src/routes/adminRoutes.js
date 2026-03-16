import express from "express";

import {
  approveDeposit,
  approveWithdrawal,
  getTeamBusiness,
  listDeposits,
  listTrades,
  listTransactionsAdmin,
  listUsers,
  listWithdrawals,
  rejectDeposit,
  rejectWithdrawal,
} from "../controllers/adminController.js";
import { checkAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate, checkAdmin);
router.get("/users", listUsers);
router.get("/deposits", listDeposits);
router.patch("/deposits/:depositId/approve", approveDeposit);
router.patch("/deposits/:depositId/reject", rejectDeposit);
router.get("/withdrawals", listWithdrawals);
router.patch("/withdrawals/:withdrawalId/approve", approveWithdrawal);
router.patch("/withdrawals/:withdrawalId/reject", rejectWithdrawal);
router.get("/trades", listTrades);
router.get("/transactions", listTransactionsAdmin);
router.get("/team-business", getTeamBusiness);

export default router;
