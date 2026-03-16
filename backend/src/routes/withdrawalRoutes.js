import express from "express";

import { createWithdrawal, getWithdrawalStatus, listWithdrawalHistory } from "../controllers/withdrawalController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.post("/", createWithdrawal);
router.post("/create", createWithdrawal);
router.get("/history", listWithdrawalHistory);
router.get("/status/:id", getWithdrawalStatus);

export default router;
