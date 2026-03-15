import { FormEvent, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { createWithdrawalRequest } from "../services/financeService";
import { fetchMyProfile } from "../services/userService";

const WithdrawalPage = () => {
  const [amount, setAmount] = useState("10");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      const profileRes = await fetchMyProfile();
      const walletAddress = profileRes.data?.user?.walletAddress;
      if (!walletAddress) {
        setMessage("Please bind your USDT BEP20 wallet address first.");
        return;
      }

      await createWithdrawalRequest({ amount: Number(amount), pin });
      setMessage("Withdrawal request submitted");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Withdrawal request failed");
    }
  };

  return (
    <DashboardLayout>
      <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
        <h2 className="text-xl font-semibold">Withdraw</h2>
        <p className="mt-1 text-sm text-slate-400">
          Only USDT BEP20. Minimum withdraw: $10. Funds go to your saved wallet address.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            type="number"
            min={10}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="Amount (USDT)"
          />
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="PIN"
          />
          <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
            Submit Withdrawal
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default WithdrawalPage;
