import express from "express";

import {
  depositToWallet,
  getWallet,
  moveToTradingBalance,
  transferToDepositWallet,
  withdrawFromWallet,
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.get("/", getWallet);
router.post("/transfer", transferToDepositWallet);
router.post("/deposit", depositToWallet);
router.post("/withdraw", withdrawFromWallet);
router.post("/trade", moveToTradingBalance);

export default router;
