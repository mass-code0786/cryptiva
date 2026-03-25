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
      <div className="rounded-2xl border border-wallet-border/60 bg-wallet-panel/70 p-4">
        <h2 className="text-xl font-semibold text-wallet-text">Withdraw</h2>
        <p className="mt-1 text-sm text-wallet-muted">
          Only USDT BEP20. Minimum withdraw: $10. Funds go to your saved wallet address.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            type="number"
            min={10}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-wallet-border/60 bg-wallet-bg p-3 text-wallet-text outline-none focus:border-wallet-accent"
            placeholder="Amount (USDT)"
          />
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-xl border border-wallet-border/60 bg-wallet-bg p-3 text-wallet-text outline-none focus:border-wallet-accent"
            placeholder="PIN"
          />
          <button className="w-full rounded-xl bg-wallet-accent px-4 py-3 font-semibold text-wallet-bg">
            Submit Withdrawal
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-wallet-accent">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default WithdrawalPage;
