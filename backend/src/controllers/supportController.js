import SupportQuery from "../models/SupportQuery.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";

export const createSupportQuery = asyncHandler(async (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const message = String(req.body.message || "").trim();

  if (!subject || !message) {
    throw new ApiError(400, "Subject and message are required");
  }

  const item = await SupportQuery.create({
    userId: req.user._id,
    subject,
    message,
    status: "pending",
  });

  res.status(201).json({ message: "Query submitted successfully", query: item });
});

export const listMySupportQueries = asyncHandler(async (req, res) => {
  const items = await SupportQuery.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ items });
});
