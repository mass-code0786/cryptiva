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
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h2 className="text-xl font-semibold">Place Trade</h2>
          <p className="mt-2 text-sm text-slate-300">
            Deposit Wallet: <span className="font-semibold text-cyan-300">${walletBalance.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Trading Wallet: <span className="font-semibold text-cyan-300">${tradingWallet.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">Minimum trade amount is $5.</p>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Trade Amount (USD)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min={5}
                step="0.01"
                className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
              />
            </label>
            <button
              disabled={isLoading}
              className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
            >
              {isLoading ? "Placing..." : "Place Trade"}
            </button>
            {message && <p className="text-sm text-cyan-200">{message}</p>}
          </form>
        </div>

        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h3 className="text-sm font-semibold text-cyan-200">Active Trade Status</h3>
          <p className="mt-1 text-xs text-slate-400">
            Trade cards below show per-trade progress only, not your overall income cap.
          </p>
          <div className="mt-3 space-y-2">
            {activeTrades.length === 0 && (
              <p className="text-sm text-slate-400">No active trades.</p>
            )}
            {activeTrades.map((trade) => (
              <div key={trade._id} className="rounded-xl bg-slate-950 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Amount</span>
                  <span className="font-semibold">${trade.amount.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">Trade Earnings</span>
                  <span className="font-semibold text-cyan-300">${trade.totalIncome.toFixed(4)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Total earnings from this trade</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className="uppercase">{trade.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
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
