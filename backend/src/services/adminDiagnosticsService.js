import mongoose from "mongoose";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Trade from "../models/Trade.js";
import Setting from "../models/Setting.js";
import { getIncomeCapState } from "./incomeCapService.js";

const CAP_RESET_SETTING_PREFIX = "income_cap_reset_v2:";

const toAmount = (value) => Number(Number(value || 0).toFixed(6));

const resolveUserByRef = async (userRef, UserModel = User) => {
  const normalizedRef = String(userRef || "").trim();
  if (!normalizedRef) return null;

  if (mongoose.isValidObjectId(normalizedRef)) {
    const byId = await UserModel.findById(normalizedRef);
    if (byId) return byId;
  }

  const byUserId = await UserModel.findOne({ userId: normalizedRef.toUpperCase() });
  if (byUserId) return byUserId;

  const byReferralCode = await UserModel.findOne({ referralCode: normalizedRef.toLowerCase() });
  if (byReferralCode) return byReferralCode;

  return UserModel.findOne({ username: normalizedRef.toUpperCase() });
};

const ensureWallet = async (userId, WalletModel = Wallet) => {
  let wallet = await WalletModel.findOne({ userId });
  if (!wallet) {
    wallet = await WalletModel.create({ userId });
  }
  return wallet;
};

const toCycleIncomeByType = (cycleIncome = {}) => ({
  trading: toAmount(cycleIncome.tradingIncomeWallet || 0),
  referral: toAmount(cycleIncome.referralIncomeWallet || 0),
  level: toAmount(cycleIncome.levelIncomeWallet || 0),
  salary: toAmount(cycleIncome.salaryIncomeWallet || 0),
});

export const getUserCapCycleDiagnostics = async ({ userRef, deps = {} } = {}) => {
  const UserModel = deps.UserModel || User;
  const WalletModel = deps.WalletModel || Wallet;
  const TradeModel = deps.TradeModel || Trade;
  const SettingModel = deps.SettingModel || Setting;
  const getIncomeCapStateFn = deps.getIncomeCapStateFn || getIncomeCapState;

  const user = await resolveUserByRef(userRef, UserModel);
  if (!user?._id) {
    return null;
  }

  const activeTradesPromise = (() => {
    const query = TradeModel.find({ userId: user._id, status: "active" });
    if (query && typeof query.select === "function") return query.select("amount _id createdAt");
    return query;
  })();
  const latestResetPromise = (async () => {
    const baseQuery = SettingModel.findOne({
      key: {
        $regex: `^${CAP_RESET_SETTING_PREFIX}${String(user._id)}:`,
      },
    });

    const sortedQuery = baseQuery && typeof baseQuery.sort === "function" ? baseQuery.sort({ valueNumber: -1, createdAt: -1 }) : baseQuery;
    if (sortedQuery && typeof sortedQuery.select === "function") {
      return sortedQuery.select("key valueString valueNumber metadata createdAt");
    }
    return sortedQuery;
  })();

  const [wallet, capState, activeTrades, latestReset] = await Promise.all([
    ensureWallet(user._id, WalletModel),
    getIncomeCapStateFn(user._id, deps),
    activeTradesPromise,
    latestResetPromise,
  ]);

  const activeTradePrincipalSum = toAmount(
    (Array.isArray(activeTrades) ? activeTrades : []).reduce((sum, trade) => sum + Number(trade?.amount || 0), 0)
  );

  const latestResetBoundaryTimestamp =
    latestReset?.metadata?.boundaryAt ||
    latestReset?.metadata?.resetBoundaryAt ||
    latestReset?.valueString ||
    null;

  return {
    user: {
      id: String(user._id),
      userId: user.userId || "",
      email: user.email || "",
    },
    capCycleVersion: Number(capState.capCycleVersion || wallet.capCycleVersion || 0),
    capCycleStartedAt: capState.capCycleStartedAt || wallet.capCycleStartedAt || null,
    capCycleIncomeOffset: {
      tradingIncomeWallet: toAmount(wallet.capCycleIncomeOffset?.tradingIncomeWallet || 0),
      referralIncomeWallet: toAmount(wallet.capCycleIncomeOffset?.referralIncomeWallet || 0),
      levelIncomeWallet: toAmount(wallet.capCycleIncomeOffset?.levelIncomeWallet || 0),
      salaryIncomeWallet: toAmount(wallet.capCycleIncomeOffset?.salaryIncomeWallet || 0),
    },
    currentCycleIncomeByType: toCycleIncomeByType(capState.cycleIncome),
    isWorkingUser: Boolean(capState.workingUser),
    currentCapAmount: toAmount(capState.maxCap || 0),
    totalIncomeCounted: toAmount(capState.totalIncome || 0),
    remainingCap: toAmount(capState.remainingCap || 0),
    activeTradePrincipalSum,
    walletTradingWallet: toAmount(wallet.tradingWallet || wallet.tradingBalance || 0),
    latestResetBoundaryTimestamp,
    latestResetMeta: latestReset
      ? {
          key: latestReset.key,
          resetAt: latestReset?.metadata?.resetAt || null,
          boundaryAt: latestReset?.metadata?.boundaryAt || null,
          cycleId: latestReset?.metadata?.cycleId || null,
          trigger: latestReset?.metadata?.trigger || null,
        }
      : null,
  };
};
