import express from "express";

import { distributeWeeklySalary, getSalaryProgress, listSalaryHistory } from "../controllers/salaryController.js";
import { requireAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getSalaryProgress);
router.get("/history", listSalaryHistory);
router.post("/distribute-weekly", requireAdmin, distributeWeeklySalary);

export default router;
