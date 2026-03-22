import express from "express";

import { createDeposit, createLiveDeposit, getDepositStatus, handleDepositWebhook, listDepositHistory } from "../controllers/depositController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/webhook", handleDepositWebhook);
router.post("/create", authenticate, createDeposit);
router.post("/create-live", authenticate, createLiveDeposit);
router.post("/", authenticate, createDeposit);
router.get("/history", authenticate, listDepositHistory);
router.get("/status/:id", authenticate, getDepositStatus);
router.get("/:id/status", authenticate, getDepositStatus);

export default router;
