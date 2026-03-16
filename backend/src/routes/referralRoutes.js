import express from "express";

import {
  getReferralIncome,
  getReferralSummary,
  getReferralTree,
  listReferralIncomeHistory,
  listReferrals,
} from "../controllers/referralController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.get("/", listReferrals);
router.get("/summary", getReferralSummary);
router.get("/tree", getReferralTree);
router.get("/income", getReferralIncome);
router.get("/income-history", listReferralIncomeHistory);

export default router;
