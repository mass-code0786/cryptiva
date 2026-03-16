import express from "express";

import { bindWalletAddress, getMe, getWalletBinding, updateMe } from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.get("/me", getMe);
router.patch("/me", updateMe);
router.post("/wallet-binding", bindWalletAddress);
router.get("/wallet-binding", getWalletBinding);

export default router;
