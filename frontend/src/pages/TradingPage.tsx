import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { createTradeRequest, fetchActiveTradesRequest } from "../services/tradingService";
import { fetchWallet, type Wallet } from "../services/walletService";

type ActiveTrade = {
  _id: string;
  amount: number;
  totalIncome: number;
  capping: number;
  status: string;
  startTime: string;
};

const resolveStatusTextClass = (status: string) => {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "success", "finished", "paid", "active"].includes(normalized)) return "text-wallet-success";
  if (["pending", "waiting", "review", "processing", "partial", "partially_paid"].includes(normalized)) return "text-wallet-warning";
  if (["failed", "rejected", "cancelled", "canceled"].includes(normalized)) return "text-wallet-danger";
  return "text-wallet-accent";
};

const TradingPage = () => {
  const [amount, setAmount] = useState("5");
  const [walletBalance, setWalletBalance] = useState(0);
  const [tradingWallet, setTradingWallet] = useState(0);
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    const [{ data: walletData }, { data: tradeData }] = await Promise.all([
      fetchWallet(),
      fetchActiveTradesRequest(),
    ]);
    const wallet = walletData.wallet as Wallet | null;
    setWalletBalance(wallet?.depositWallet || 0);
    setTradingWallet(wallet?.tradingWallet || wallet?.tradingBalance || 0);
    setActiveTrades(tradeData.items || []);
  };

  useEffect(() => {
    loadData().catch(() => {
      setWalletBalance(0);
      setTradingWallet(0);
      setActiveTrades([]);
    });
    const timer = window.setInterval(() => {
      loadData().catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);

    try {
      const amountNumber = Number(amount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        setMessage("Enter a valid amount");
        return;
      }

      await createTradeRequest({ amount: amountNumber });
      setMessage("Trade placed successfully");
      await loadData();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Failed to place trade");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
          <h2 className="text-xl font-semibold text-wallet-text">Place Trade</h2>
          <p className="mt-2 text-sm text-wallet-text">
            Deposit Wallet: <span className="wallet-profit-flash font-semibold text-wallet-accent">${walletBalance.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-sm text-wallet-text">
            Trading Wallet: <span className="wallet-profit-flash font-semibold text-wallet-accent">${tradingWallet.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-sm text-wallet-muted">Minimum trade amount is $5.</p>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm text-wallet-text">Trade Amount (USD)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min={5}
                step="0.01"
                className="wallet-input"
              />
            </label>
            <button
              disabled={isLoading}
              className="wallet-button-primary w-full disabled:opacity-60"
            >
              {isLoading ? "Placing..." : "Place Trade"}
            </button>
            {message && <p className="text-sm text-wallet-accent">{message}</p>}
          </form>
        </div>

        <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
          <h3 className="text-sm font-semibold text-wallet-accent">Active Trade Status</h3>
          <p className="mt-1 text-xs text-wallet-muted">
            Trade cards below show per-trade progress only, not your overall income cap.
          </p>
          <div className="mt-3 space-y-2">
            {activeTrades.length === 0 && (
              <p className="text-sm text-wallet-muted">No active trades.</p>
            )}
            {activeTrades.map((trade) => (
              <div key={trade._id} className="wallet-row-enter rounded-xl border border-wallet-border bg-wallet-panelAlt p-3 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-wallet-accent/35">
                <div className="flex items-center justify-between">
                  <span className="text-wallet-muted">Amount</span>
                  <span className="font-semibold text-wallet-text">${trade.amount.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-wallet-muted">Trade Earnings</span>
                  <span className="wallet-profit-flash font-semibold text-wallet-success">${trade.totalIncome.toFixed(4)}</span>
                </div>
                <p className="mt-1 text-xs text-wallet-muted">Total earnings from this trade</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-wallet-muted">Status</span>
                  <span className={`uppercase ${resolveStatusTextClass(trade.status)}`}>{trade.status}</span>
                </div>
                <p className="mt-1 text-xs text-wallet-muted">
                  Started: {new Date(trade.startTime).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TradingPage;
