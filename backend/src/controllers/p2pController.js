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
  const receiverEmail = String(req.body.receiverEmail || "").toLowerCase().trim();
  const note = String(req.body.note || "").trim();

  if (!receiverEmail || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Receiver email and valid amount are required");
  }

  const receiver = await User.findOne({ email: receiverEmail });
  if (!receiver) {
    throw new ApiError(404, "Receiver not found");
  }

  if (receiver._id.toString() === req.user._id.toString()) {
    throw new ApiError(400, "Cannot transfer to your own account");
  }

  const senderWallet = await ensureWallet(req.user._id);
  if (senderWallet.withdrawalWallet < amount) {
    throw new ApiError(400, "Insufficient withdrawal wallet balance");
  }

  const receiverWallet = await ensureWallet(receiver._id);

  senderWallet.withdrawalWallet -= amount;
  senderWallet.p2pTotal += amount;
  senderWallet.balance = senderWallet.depositWallet + senderWallet.withdrawalWallet;

  receiverWallet.withdrawalWallet += amount;
  receiverWallet.p2pTotal += amount;
  receiverWallet.balance = receiverWallet.depositWallet + receiverWallet.withdrawalWallet;

  await senderWallet.save();
  await receiverWallet.save();

  await Transaction.create({
    userId: req.user._id,
    type: "p2p",
    amount,
    network: "INTERNAL",
    source: `P2P sent to ${receiver.email}${note ? `: ${note}` : ""}`,
    status: "completed",
  });

  await Transaction.create({
    userId: receiver._id,
    type: "p2p",
    amount,
    network: "INTERNAL",
    source: `P2P received from ${req.user.email}${note ? `: ${note}` : ""}`,
    status: "completed",
  });

  res.json({ message: "P2P transfer completed" });
});
