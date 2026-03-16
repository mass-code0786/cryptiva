import ReferralIncome from "../models/ReferralIncome.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import { logIncomeEvent } from "./incomeLogService.js";
import { applyIncomeWithCap } from "./incomeCapService.js";

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
  const { creditedAmount: directCredited } = await applyIncomeWithCap({
    userId: directReferrer._id,
    requestedAmount: directReward,
    walletField: "referralIncomeWallet",
  });

  if (directCredited > 0) {
    await Promise.all([
      addTransaction(directReferrer._id, "referral", directCredited, `Direct referral bonus from ${user.email}`),
      logIncomeEvent({
        userId: directReferrer._id,
        incomeType: "referral",
        amount: directCredited,
        source: `Direct referral bonus from ${user.email}`,
        metadata: { sourceUserId: user._id, depositId },
      }),
      ReferralIncome.create({
        userId: directReferrer._id,
        sourceUserId: user._id,
        depositId,
        incomeType: "direct",
        level: 1,
        amount: directCredited,
        metadata: { sourceEmail: user.email },
      }),
    ]);
  }

  if (!directReferrer.referredBy) {
    return;
  }

  const levelReferrer = await User.findById(directReferrer.referredBy);
  if (!levelReferrer) {
    return;
  }

  const levelReward = Number((depositAmount * 0.02).toFixed(2));
  const { creditedAmount: levelCredited } = await applyIncomeWithCap({
    userId: levelReferrer._id,
    requestedAmount: levelReward,
    walletField: "levelIncomeWallet",
  });

  if (levelCredited > 0) {
    await Promise.all([
      addTransaction(levelReferrer._id, "level", levelCredited, `Level referral bonus from ${user.email}`),
      logIncomeEvent({
        userId: levelReferrer._id,
        incomeType: "level",
        amount: levelCredited,
        source: `Level referral bonus from ${user.email}`,
        metadata: { sourceUserId: user._id, depositId },
      }),
      ReferralIncome.create({
        userId: levelReferrer._id,
        sourceUserId: user._id,
        depositId,
        incomeType: "level",
        level: 2,
        amount: levelCredited,
        metadata: { sourceEmail: user.email },
      }),
    ]);
  }
};
