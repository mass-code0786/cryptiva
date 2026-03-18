import Trade from "../models/Trade.js";
import Wallet from "../models/Wallet.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { getCurrentTradeEngineConfig, settleTradeIncome } from "../services/tradeEngineService.js";
import { startTradeAndActivate } from "../services/tradeActivationService.js";

export const placeTrade = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 5) {
    throw new ApiError(400, "Minimum trade amount is $5");
  }

  const wallet = await Wallet.findOne({ userId: req.user._id });
  if (!wallet || Number(wallet.depositWallet || 0) < amount) {
    throw new ApiError(400, "Insufficient wallet balance for activation");
  }

  const { trade } = await startTradeAndActivate({
    user: req.user,
    amount,
    activationSource: "trade_start",
  });

  res.status(201).json({
    message: "Trade placed successfully",
    trade,
  });
});

export const getTradeStatus = asyncHandler(async (req, res) => {
  const trades = await Trade.find({ userId: req.user._id, status: "active" }).sort({ createdAt: -1 });
  const settledTrades = [];

  for (const trade of trades) {
    const result = await settleTradeIncome(trade);
    settledTrades.push(result.trade);
  }

  const engine = await getCurrentTradeEngineConfig();
  res.json({ items: settledTrades, engine });
});
