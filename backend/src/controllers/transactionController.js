import Transaction from "../models/Transaction.js";
import Withdrawal from "../models/Withdrawal.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const listTransactions = asyncHandler(async (req, res) => {
  const query = {
    userId: req.user._id,
    $and: [
      {
        $or: [
          { type: { $ne: "deposit" } },
          { type: "deposit", status: { $in: ["completed", "confirmed"] } },
        ],
      },
      {
        $or: [{ type: { $ne: "trading" } }, { "metadata.action": { $ne: "trade_open" } }],
      },
    ],
  };
  if (req.query.type) {
    const type = String(req.query.type).toLowerCase();
    if (type === "referral") {
      query.type = { $in: ["referral", "REFERRAL"] };
    } else if (type === "level") {
      query.type = { $in: ["level", "LEVEL"] };
    } else if (type === "salary") {
      query.type = { $in: ["salary", "SALARY"] };
    } else {
      query.type = String(req.query.type);
    }
  }
  const hasPaging = req.query.page !== undefined || req.query.limit !== undefined;

  const [total, withdrawalSummaryRows] = await Promise.all([
    Transaction.countDocuments(query),
    Withdrawal.aggregate([
      { $match: { userId: req.user._id, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = hasPaging ? Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20)) : Math.max(1, total);
  const skip = (page - 1) * limit;

  const items = await Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

  res.json({
    items,
    summary: {
      totalWithdrawalCompleted: Number(withdrawalSummaryRows?.[0]?.total || 0),
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
