import express from "express";

import {
  bindWalletAddress,
  changeMyPassword,
  getMe,
  getWalletBinding,
  lookupUserByUserId,
  updateMe,
  updateMyReferralCode,
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.get("/me", getMe);
router.patch("/me", updateMe);
router.patch("/change-password", changeMyPassword);
router.patch("/referral-code", updateMyReferralCode);
router.post("/wallet-binding", bindWalletAddress);
router.get("/wallet-binding", getWalletBinding);
router.get("/lookup/:userId", lookupUserByUserId);

export default router;
