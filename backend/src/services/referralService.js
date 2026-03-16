import ReferralIncome from "../models/ReferralIncome.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { logIncomeEvent } from "./incomeLogService.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

const addTransaction = (userId, type, amount, source, status = "completed", metadata = {}, network = "INTERNAL") =>
  Transaction.create({ userId, type, amount, source, status, metadata, network });

export const distributeReferralRewards = async ({ user, depositAmount, depositId }) => {
  if (!user.referredBy) {
    return;
  }

  const directReferrer = await User.findById(user.referredBy);
  if (!directReferrer) {
    return;
  }

  const directReward = Number((depositAmount * 0.05).toFixed(2));
  const directWallet = await ensureWallet(directReferrer._id);
  directWallet.withdrawalWallet += directReward;
  directWallet.balance = directWallet.depositWallet + directWallet.withdrawalWallet;
  await directWallet.save();

  await Promise.all([
    addTransaction(directReferrer._id, "referral", directReward, `Direct referral bonus from ${user.email}`),
    logIncomeEvent({
      userId: directReferrer._id,
      incomeType: "referral",
      amount: directReward,
      source: `Direct referral bonus from ${user.email}`,
      metadata: { sourceUserId: user._id, depositId },
    }),
    ReferralIncome.create({
      userId: directReferrer._id,
      sourceUserId: user._id,
      depositId,
      incomeType: "direct",
      level: 1,
      amount: directReward,
      metadata: { sourceEmail: user.email },
    }),
  ]);

  if (!directReferrer.referredBy) {
    return;
  }

  const levelReferrer = await User.findById(directReferrer.referredBy);
  if (!levelReferrer) {
    return;
  }

  const levelReward = Number((depositAmount * 0.02).toFixed(2));
  const levelWallet = await ensureWallet(levelReferrer._id);
  levelWallet.withdrawalWallet += levelReward;
  levelWallet.balance = levelWallet.depositWallet + levelWallet.withdrawalWallet;
  await levelWallet.save();

  await Promise.all([
    addTransaction(levelReferrer._id, "level", levelReward, `Level referral bonus from ${user.email}`),
    logIncomeEvent({
      userId: levelReferrer._id,
      incomeType: "level",
      amount: levelReward,
      source: `Level referral bonus from ${user.email}`,
      metadata: { sourceUserId: user._id, depositId },
    }),
    ReferralIncome.create({
      userId: levelReferrer._id,
      sourceUserId: user._id,
      depositId,
      incomeType: "level",
      level: 2,
      amount: levelReward,
      metadata: { sourceEmail: user.email },
    }),
  ]);
};
