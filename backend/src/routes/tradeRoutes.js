import express from "express";

import { getTradeStatus, placeTrade } from "../controllers/tradeController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.post("/place", placeTrade);
router.post("/", placeTrade);
router.get("/status", getTradeStatus);

export default router;
