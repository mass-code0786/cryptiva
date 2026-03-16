import express from "express";

import { sendP2P } from "../controllers/p2pController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.post("/send", sendP2P);

export default router;
