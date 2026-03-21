import express from "express";

import { downloadPopupBannerImage, getActivePopupBanner } from "../controllers/popupBannerController.js";

const router = express.Router();

router.get("/active", getActivePopupBanner);
router.get("/:bannerId/download", downloadPopupBannerImage);

export default router;
