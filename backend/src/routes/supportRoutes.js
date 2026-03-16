import express from "express";

import { createSupportQuery, listMySupportQueries } from "../controllers/supportController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);
router.post("/create", createSupportQuery);
router.get("/my-queries", listMySupportQueries);

export default router;
