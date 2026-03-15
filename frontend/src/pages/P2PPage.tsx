import { FormEvent, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { sendP2PRequest } from "../services/financeService";

const P2PPage = () => {
  const [receiverEmail, setReceiverEmail] = useState("");
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await sendP2PRequest({ receiverEmail, amount: Number(amount), note });
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
            value={receiverEmail}
            onChange={(e) => setReceiverEmail(e.target.value)}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="Receiver Email"
          />
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
            Send Transfer
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default P2PPage;
