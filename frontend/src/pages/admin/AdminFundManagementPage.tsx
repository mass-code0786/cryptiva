import { FormEvent, useState } from "react";
import { deductAdminFund, transferAdminFund } from "../../services/adminService";

const initialForm = { userId: "", amount: "", reason: "" };

const AdminFundManagementPage = () => {
  const [transferForm, setTransferForm] = useState(initialForm);
  const [deductForm, setDeductForm] = useState(initialForm);
  const [loadingType, setLoadingType] = useState<"transfer" | "deduct" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submitTransfer = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const amount = Number(transferForm.amount);
    if (!transferForm.userId || !Number.isFinite(amount) || amount <= 0 || !transferForm.reason) {
      setError("Transfer requires user ID, valid amount, and reason.");
      return;
    }
    setLoadingType("transfer");
    try {
      await transferAdminFund({ userId: transferForm.userId.trim(), amount, reason: transferForm.reason.trim() });
      setMessage("Funds transferred successfully.");
      setTransferForm(initialForm);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to transfer funds");
    } finally {
      setLoadingType("");
    }
  };

  const submitDeduct = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const amount = Number(deductForm.amount);
    if (!deductForm.userId || !Number.isFinite(amount) || amount <= 0 || !deductForm.reason) {
      setError("Deduction requires user ID, valid amount, and reason.");
      return;
    }
    setLoadingType("deduct");
    try {
      await deductAdminFund({ userId: deductForm.userId.trim(), amount, reason: deductForm.reason.trim() });
      setMessage("Funds deducted successfully.");
      setDeductForm(initialForm);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to deduct funds");
    } finally {
      setLoadingType("");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Fund Management</h2>
        <p className="mt-1 text-sm text-slate-300">Transfer or deduct user funds with reason tracking.</p>
      </div>

      {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form onSubmit={submitTransfer} className="space-y-3 rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Transfer Funds</h3>
          <input
            value={transferForm.userId}
            onChange={(event) => setTransferForm((prev) => ({ ...prev, userId: event.target.value }))}
            placeholder="User ID"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <input
            value={transferForm.amount}
            onChange={(event) => setTransferForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder="Amount"
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <textarea
            value={transferForm.reason}
            onChange={(event) => setTransferForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Reason"
            rows={3}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={loadingType === "transfer"}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
          >
            {loadingType === "transfer" ? "Processing..." : "Transfer Funds"}
          </button>
        </form>

        <form onSubmit={submitDeduct} className="space-y-3 rounded-2xl border border-amber-700/30 bg-slate-950/55 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-200">Deduct Funds</h3>
          <input
            value={deductForm.userId}
            onChange={(event) => setDeductForm((prev) => ({ ...prev, userId: event.target.value }))}
            placeholder="User ID"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
          />
          <input
            value={deductForm.amount}
            onChange={(event) => setDeductForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder="Amount"
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
          />
          <textarea
            value={deductForm.reason}
            onChange={(event) => setDeductForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Reason"
            rows={3}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={loadingType === "deduct"}
            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
          >
            {loadingType === "deduct" ? "Processing..." : "Deduct Funds"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default AdminFundManagementPage;
