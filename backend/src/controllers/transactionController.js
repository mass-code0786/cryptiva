import Transaction from "../models/Transaction.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const listTransactions = asyncHandler(async (req, res) => {
  const query = {
    userId: req.user._id,
    $or: [
      { type: { $ne: "deposit" } },
      { type: "deposit", status: { $in: ["completed", "confirmed"] } },
    ],
  };
  if (req.query.type) {
    query.type = String(req.query.type);
  }
  const hasPaging = req.query.page !== undefined || req.query.limit !== undefined;

  const total = await Transaction.countDocuments(query);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = hasPaging ? Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20)) : Math.max(1, total);
  const skip = (page - 1) * limit;

  const items = await Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
