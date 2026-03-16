import express from "express";

import { createDeposit, getDepositStatus, handleDepositWebhook, listDepositHistory } from "../controllers/depositController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/webhook", handleDepositWebhook);
router.post("/create", authenticate, createDeposit);
router.post("/", authenticate, createDeposit);
router.get("/history", authenticate, listDepositHistory);
router.get("/status/:id", authenticate, getDepositStatus);

export default router;
