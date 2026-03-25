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
        <div className="wallet-panel-strong p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="wallet-kicker">Trading Wallet</p>
              <h2 className="wallet-title mt-2 text-xl">Place Trade</h2>
            </div>
            <span className="wallet-chip wallet-status-info">Min $5</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[20px] border border-white/10 bg-[#0a1b34]/86 p-3">
              <p className="text-xs text-wallet-muted">Deposit Wallet</p>
              <p className="mt-2 text-xl font-semibold text-wallet-accentSoft">${walletBalance.toFixed(2)}</p>
            </div>
            <div className="rounded-[20px] border border-wallet-accent/20 bg-wallet-accent/10 p-3">
              <p className="text-xs text-wallet-muted">Trading Wallet</p>
              <p className="mt-2 text-xl font-semibold text-wallet-text">${tradingWallet.toFixed(2)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-wallet-muted">
            Deposit Wallet: <span className="font-semibold text-wallet-accentSoft">${walletBalance.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-sm text-wallet-muted">
            Trading Wallet: <span className="font-semibold text-wallet-accentSoft">${tradingWallet.toFixed(2)}</span>
          </p>
          <p className="mt-1 text-sm text-wallet-muted">Minimum trade amount is $5.</p>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm text-wallet-muted">Trade Amount (USD)</span>
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
            {message && <p className="text-sm text-wallet-accentSoft">{message}</p>}
          </form>
        </div>

        <div className="wallet-panel p-4">
          <h3 className="wallet-title text-sm">Active Trade Status</h3>
          <p className="mt-1 text-xs text-wallet-muted">
            Trade cards below show per-trade progress only, not your overall income cap.
          </p>
          <div className="mt-3 space-y-2">
            {activeTrades.length === 0 && (
              <p className="wallet-empty-state">No active trades.</p>
            )}
            {activeTrades.map((trade) => (
              <div key={trade._id} className="rounded-[20px] border border-white/8 bg-[#0a1b34]/88 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-wallet-muted">Amount</span>
                  <span className="font-semibold text-wallet-text">${trade.amount.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-wallet-muted">Trade Earnings</span>
                  <span className="font-semibold text-wallet-accentSoft">${trade.totalIncome.toFixed(4)}</span>
                </div>
                <p className="mt-1 text-xs text-wallet-muted">Total earnings from this trade</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-wallet-muted">Status</span>
                  <span className="wallet-chip wallet-status-info">{trade.status}</span>
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
