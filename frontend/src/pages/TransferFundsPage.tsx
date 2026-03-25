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
      <div className="wallet-panel p-4 sm:p-5">
        <h2 className="wallet-title text-xl">Transfer Funds</h2>
        <p className="mt-1 text-sm text-wallet-muted">Move funds from Withdrawal Wallet to Deposit Wallet.</p>

        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div className="rounded-[20px] border border-wallet-border bg-wallet-panelAlt p-3 text-sm">
            <p className="text-wallet-muted">Transfer From</p>
            <p className="font-medium text-wallet-accent">Withdrawal Wallet</p>
          </div>
          <div className="rounded-[20px] border border-wallet-border bg-wallet-panelAlt p-3 text-sm">
            <p className="text-wallet-muted">Transfer To</p>
            <p className="font-medium text-wallet-accent">Deposit Wallet</p>
          </div>
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="wallet-input"
          />
          <button
            disabled={loading}
            className="wallet-button-primary w-full disabled:opacity-60"
          >
            {loading ? "Transferring..." : "Transfer"}
          </button>
        </form>

        {message && <p className="mt-3 text-sm text-wallet-accent">{message}</p>}
      </div>
    </DashboardLayout>
  );
};

export default TransferFundsPage;

