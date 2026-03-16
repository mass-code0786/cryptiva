import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";

const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const sendP2P = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const receiverUserId = String(req.body.receiverUserId || "").toUpperCase().trim();
  const note = String(req.body.note || "").trim();

  if (!receiverUserId || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Receiver User ID and valid amount are required");
  }

  const receiver = await User.findOne({ userId: receiverUserId });
  if (!receiver) {
    throw new ApiError(404, "Invalid User ID");
  }

  if (String(req.user.userId || "").toUpperCase() === receiverUserId) {
    throw new ApiError(400, "Cannot transfer to your own account");
  }

  const senderWallet = await ensureWallet(req.user._id);
  if (senderWallet.depositWallet < amount) {
    throw new ApiError(400, "Insufficient deposit wallet balance");
  }

  const receiverWallet = await ensureWallet(receiver._id);

  senderWallet.depositWallet -= amount;
  senderWallet.p2pTotal += amount;
  senderWallet.balance = senderWallet.depositWallet + senderWallet.withdrawalWallet;

  receiverWallet.depositWallet += amount;
  receiverWallet.p2pTotal += amount;
  receiverWallet.balance = receiverWallet.depositWallet + receiverWallet.withdrawalWallet;

  await senderWallet.save();
  await receiverWallet.save();

  await Transaction.create({
    userId: req.user._id,
    type: "P2P_TRANSFER",
    amount: -amount,
    network: "INTERNAL",
    source: `P2P sent to ${receiver.userId}${note ? `: ${note}` : ""}`,
    status: "success",
    metadata: { receiverUserId: receiver.userId, note },
  });

  await Transaction.create({
    userId: receiver._id,
    type: "P2P_RECEIVE",
    amount,
    network: "INTERNAL",
    source: `P2P received from ${req.user.userId}${note ? `: ${note}` : ""}`,
    status: "success",
    metadata: { senderUserId: req.user.userId, note },
  });

  res.json({ message: "P2P transfer completed" });
});
