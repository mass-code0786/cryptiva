import IncomeLog from "../models/IncomeLog.js";

const supportedIncomeTypes = new Set(["trading", "referral", "level", "salary"]);

export const logIncomeEvent = async ({ userId, incomeType, amount, source = "", metadata = {}, recordedAt = new Date() }) => {
  if (!supportedIncomeTypes.has(incomeType)) {
    return null;
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return null;
  }

  const iso = new Date(recordedAt).toISOString();

  return IncomeLog.create({
    userId,
    incomeType,
    type: incomeType,
    amount: Number(amount),
    source,
    metadata,
    recordedAt,
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
  });
};
