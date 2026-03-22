import Trade from "../models/Trade.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import PackagePurchase from "../models/PackagePurchase.js";
import { activateUserById } from "./activationService.js";
import { distributeUnilevelIncomeOnTradeStart } from "./referralService.js";
import { getDefaultTradeLimit } from "./tradeEngineService.js";
import { syncTeamBusinessForUserAndUplines } from "../controllers/referralController.js";

const ensureWallet = async (userId, WalletModel = Wallet) => {
  let wallet = await WalletModel.findOne({ userId });
  if (!wallet) {
    wallet = await WalletModel.create({ userId });
  }
  return wallet;
};

const getActiveTradingPrincipal = async (userId, TradeModel = Trade) => {
  const activeTrades = await TradeModel.find({ userId, status: "active" }).select("amount");
  return Number(
    activeTrades
      .reduce((sum, trade) => sum + Number(trade?.amount || 0), 0)
      .toFixed(6)
  );
};

export const startTradeAndActivate = async ({ user, amount, activationSource = "trade_start", deps = {} }) => {
  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    throw new Error("Invalid activation amount");
  }

  const WalletModel = deps.WalletModel || Wallet;
  const TradeModel = deps.TradeModel || Trade;
  const TransactionModel = deps.TransactionModel || Transaction;
  const PackagePurchaseModel = deps.PackagePurchaseModel || PackagePurchase;
  const activateUserByIdFn = deps.activateUserByIdFn || activateUserById;
  const distributeUnilevelIncomeOnTradeStartFn = deps.distributeUnilevelIncomeOnTradeStartFn || distributeUnilevelIncomeOnTradeStart;
  const syncTeamBusinessForUserAndUplinesFn = deps.syncTeamBusinessForUserAndUplinesFn || syncTeamBusinessForUserAndUplines;
  const logger = deps.logger || console;

  const wallet = await ensureWallet(user._id, WalletModel);
  const activePrincipal = await getActiveTradingPrincipal(user._id, TradeModel);

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

  const trade = await TradeModel.create({
    userId: user._id,
    amount: amountValue,
    capping: getDefaultTradeLimit(amountValue),
    investmentLimit: getDefaultTradeLimit(amountValue),
    status: "active",
  });

  await TransactionModel.create({
    userId: user._id,
    type: "wallet_transfer",
    amount: amountValue,
    network: "INTERNAL",
    source: "Wallet balance to trading wallet",
    status: "completed",
    metadata: { tradeId: trade._id, action: "trade_open", fundingSource: "wallet_balance_any_source" },
  });
  await TransactionModel.create({
    userId: user._id,
    type: "trade_start",
    amount: Number((-amountValue).toFixed(6)),
    network: "INTERNAL",
    source: "Trading Started",
    status: "completed",
    metadata: {
      tradeId: trade._id,
      source: "trading_funding",
    },
  });
  logger.info(
    `[trade-activation] trade_start transaction created: user=${String(user._id)} tradeId=${String(trade._id)} amount=${Number((-amountValue).toFixed(6))}`
  );

  await PackagePurchaseModel.create({
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

  await activateUserByIdFn({ userId: user._id, source: activationSource });
  await distributeUnilevelIncomeOnTradeStartFn({
    traderUser: user,
    tradeAmount: amountValue,
    tradeId: trade._id,
  });
  await syncTeamBusinessForUserAndUplinesFn(user._id);

  return { wallet, trade };
};
