import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import { getDefaultTradeLimit, getTradeEngineConfig, settleTradeIncome } from "../services/tradeEngineService.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const placeTrade = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 5) {
    throw new ApiError(400, "Minimum trade amount is $5");
  }

  const wallet = await ensureWallet(req.user._id);
  if (wallet.depositWallet < amount) {
    throw new ApiError(400, "Please deposit first");
  }

  wallet.depositWallet -= amount;
  wallet.tradingWallet = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  wallet.tradingWallet += amount;
  wallet.tradingBalance = wallet.tradingWallet;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const trade = await Trade.create({
    userId: req.user._id,
    amount,
    capping: getDefaultTradeLimit(amount),
    investmentLimit: getDefaultTradeLimit(amount),
    status: "active",
  });

  await Transaction.create({
    userId: req.user._id,
    type: "trading",
    amount,
    network: "INTERNAL",
    source: "Investment moved to trading",
    status: "completed",
    metadata: { tradeId: trade._id, action: "trade_open" },
  });

  res.status(201).json({
    message: "Trade placed successfully",
    trade,
  });
});

export const getTradeStatus = asyncHandler(async (req, res) => {
  const trades = await Trade.find({ userId: req.user._id }).sort({ createdAt: -1 });
  const settledTrades = [];

  for (const trade of trades) {
    const result = await settleTradeIncome(trade);
    settledTrades.push(result.trade);
  }

  res.json({ items: settledTrades, engine: getTradeEngineConfig() });
});
