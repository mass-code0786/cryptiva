import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { sendP2PRequest } from "../services/financeService";
import { lookupUserByUserId } from "../services/userService";
import { useAuth } from "../hooks/useAuth";

const P2PPage = () => {
  const { user } = useAuth();
  const [receiverUserId, setReceiverUserId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!receiverUserId.trim()) {
      setReceiverName("");
      setLookupMessage("");
      return;
    }

    const current = receiverUserId.trim().toUpperCase();
    const timer = window.setTimeout(async () => {
      if (current === String(user?.userId || "").toUpperCase()) {
        setReceiverName("");
        setLookupMessage("Cannot transfer to your own User ID");
        return;
      }

      try {
        const { data } = await lookupUserByUserId(current);
        setReceiverName(data.user?.name || "");
        setLookupMessage(data.user?.name ? `Receiver: ${data.user.name}` : "");
      } catch {
        setReceiverName("");
        setLookupMessage("Invalid User ID");
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [receiverUserId, user?.userId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await sendP2PRequest({ receiverUserId, amount: Number(amount), note });
      setMessage("P2P transfer successful");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "P2P transfer failed");
    }
  };

  return (
    <DashboardLayout>
      <div className="wallet-panel p-4">
        <h2 className="wallet-title text-xl">P2P Transfer</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            value={receiverUserId}
            onChange={(e) => setReceiverUserId(e.target.value.toUpperCase())}
            className="wallet-input"
            placeholder="Receiver User ID (e.g. CTV-82AYIWCF)"
          />
          {lookupMessage && (
            <p className={`text-xs ${receiverName ? "text-wallet-success" : "text-wallet-danger"}`}>{lookupMessage}</p>
          )}
          <input
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="wallet-input"
            placeholder="Amount"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="wallet-input"
            placeholder="Note (optional)"
          />
          <button className="wallet-button-primary w-full">
            Send Funds
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-wallet-accent">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default P2PPage;
