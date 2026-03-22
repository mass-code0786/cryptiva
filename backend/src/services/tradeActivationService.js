import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import PackagePurchase from "../models/PackagePurchase.js";
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

const getActiveTradingPrincipal = async (userId) => {
  const activeTrades = await Trade.find({ userId, status: "active" }).select("amount");
  return Number(
    activeTrades
      .reduce((sum, trade) => sum + Number(trade?.amount || 0), 0)
      .toFixed(6)
  );
};

export const startTradeAndActivate = async ({ user, amount, activationSource = "trade_start" }) => {
  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new Error("Invalid activation amount");
  }

  const wallet = await ensureWallet(user._id);
  const activePrincipal = await getActiveTradingPrincipal(user._id);

  if (wallet.depositWallet < amountValue) {
    throw new Error("Insufficient deposit wallet balance");
  }

  wallet.depositWallet -= amountValue;
  const walletPrincipal = Number(wallet.tradingWallet || wallet.tradingBalance || 0);
  const reconciledPrincipal = Number(Math.max(walletPrincipal, activePrincipal).toFixed(6));
  wallet.tradingWallet = Number((reconciledPrincipal + amountValue).toFixed(6));
  wallet.tradingBalance = wallet.tradingWallet;
  wallet.balance = wallet.depositWallet + wallet.withdrawalWallet;
  await wallet.save();
  if (reconciledPrincipal !== walletPrincipal) {
    console.info(
      `[trade-activation] principal reconciled before trade start: user=${String(user._id)} walletPrincipal=${walletPrincipal} activePrincipal=${activePrincipal} reconciledPrincipal=${reconciledPrincipal}`
    );
  }

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
    source: "Wallet balance to trading wallet",
    status: "completed",
    metadata: { tradeId: trade._id, action: "trade_open", fundingSource: "wallet_balance_any_source" },
  });

  await PackagePurchase.create({
    userId: user._id,
    tradeId: trade._id,
    packageName: "wallet_activation",
    amount: amountValue,
    status: "active",
    activationSource,
    fundingSource: "wallet_balance_any_source",
    activatedAt: new Date(),
    metadata: {
      trigger: "trade_open",
      note: "Activation funded from wallet balance without source restrictions",
    },
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
