import express from "express";

import { handleDepositWebhook } from "../controllers/depositController.js";

const router = express.Router();

router.post("/:gateway", handleDepositWebhook);

export default router;

