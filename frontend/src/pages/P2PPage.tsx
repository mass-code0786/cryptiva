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
      <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
        <h2 className="text-xl font-semibold">P2P Transfer</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            value={receiverUserId}
            onChange={(e) => setReceiverUserId(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="Receiver User ID (e.g. CTV-82AYIWCF)"
          />
          {lookupMessage && (
            <p className={`text-xs ${receiverName ? "text-emerald-300" : "text-rose-300"}`}>{lookupMessage}</p>
          )}
          <input
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="Amount"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="Note (optional)"
          />
          <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
            Send Funds
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default P2PPage;
