import express from "express";

import { getSettingByKey, upsertSettingByKey } from "../controllers/settingsController.js";
import { checkAdmin } from "../middleware/admin.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/:key", getSettingByKey);
router.post("/:key", authenticate, checkAdmin, upsertSettingByKey);

export default router;
