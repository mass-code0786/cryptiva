import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { activateUserById } from "./activationService.js";
import { distributeUnilevelIncomeOnTradeStart } from "./referralService.js";
import { getDefaultTradeLimit } from "./tradeEngineService.js";
import { syncTeamBusinessForUserAndUplines } from "../controllers/referralController.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const startTradeAndActivate = async ({ user, amount, activationSource = "trade_start" }) => {
  const amountValue = Number(amount);
  const wallet = await ensureWallet(user._id);

  if (wallet.depositWallet < amountValue) {
    throw new Error("Insufficient deposit wallet balance");
  }

  wallet.depositWallet -= amountValue;
  wallet.tradingWallet = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  wallet.tradingWallet += amountValue;
  wallet.tradingBalance = wallet.tradingWallet;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();

  const trade = await Trade.create({
    userId: user._id,
    amount: amountValue,
    capping: getDefaultTradeLimit(amountValue),
    investmentLimit: getDefaultTradeLimit(amountValue),
    status: "active",
  });

  await Transaction.create({
    userId: user._id,
    type: "wallet_transfer",
    amount: amountValue,
    network: "INTERNAL",
    source: "Deposit wallet to trading wallet",
    status: "completed",
    metadata: { tradeId: trade._id, action: "trade_open" },
  });

  await activateUserById({ userId: user._id, source: activationSource });
  await distributeUnilevelIncomeOnTradeStart({
    traderUser: user,
    tradeAmount: amountValue,
    tradeId: trade._id,
  });
  await syncTeamBusinessForUserAndUplines(user._id);

  return { wallet, trade };
};
