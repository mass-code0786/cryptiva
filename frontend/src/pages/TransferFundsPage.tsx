import { FormEvent, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { transferToDepositWalletRequest } from "../services/financeService";

const TransferFundsPage = () => {
  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      await transferToDepositWalletRequest({ amount: Number(amount) });
      setMessage("Funds transferred successfully.");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4 sm:p-5">
        <h2 className="text-xl font-semibold">Transfer Funds</h2>
        <p className="mt-1 text-sm text-slate-400">Move funds from Withdrawal Wallet to Deposit Wallet.</p>

        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div className="rounded-xl border border-cyan-900/40 bg-slate-950/70 p-3 text-sm">
            <p className="text-slate-400">Transfer From</p>
            <p className="font-medium text-cyan-200">Withdrawal Wallet</p>
          </div>
          <div className="rounded-xl border border-cyan-900/40 bg-slate-950/70 p-3 text-sm">
            <p className="text-slate-400">Transfer To</p>
            <p className="font-medium text-cyan-200">Deposit Wallet</p>
          </div>
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
          />
          <button
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
          >
            {loading ? "Transferring..." : "Transfer"}
          </button>
        </form>

        {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default TransferFundsPage;

