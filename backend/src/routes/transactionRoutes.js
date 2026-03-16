import express from "express";

import { listTransactions } from "../controllers/transactionController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.get("/", listTransactions);

export default router;
