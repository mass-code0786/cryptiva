import express from "express";

import { getSettingByKey, upsertSettingByKey } from "../controllers/settingsController.js";
import { checkAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Explicit route to avoid any ambiguity and guarantee this commonly used key resolves.
router.get("/demo_bot_disclaimer", (req, res, next) => {
  req.params.key = "demo_bot_disclaimer";
  next();
}, getSettingByKey);
router.get("/:key", getSettingByKey);
router.post("/:key", authenticate, checkAdmin, upsertSettingByKey);

export default router;
