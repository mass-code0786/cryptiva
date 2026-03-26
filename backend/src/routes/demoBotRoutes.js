import express from "express";

import { generateNextDemoBotEntry, getGlobalDemoBotFeed } from "../controllers/demoBotController.js";
import { checkAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/feed", authenticate, getGlobalDemoBotFeed);
router.post("/generate-next", authenticate, checkAdmin, generateNextDemoBotEntry);

export default router;
