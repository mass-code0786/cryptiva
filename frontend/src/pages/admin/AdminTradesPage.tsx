import { useEffect, useState } from "react";
import {
  adjustAdminTradeIncome,
  fetchAdminTradingRoiSetting,
  fetchAdminTrades,
  updateAdminTradingRoiSetting,
  updateAdminTradeProfitRate,
  type AdminTradeItem,
} from "../../services/adminService";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminTradesPage = () => {
  const [items, setItems] = useState<AdminTradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [roiLoading, setRoiLoading] = useState(false);
  const [currentRoi, setCurrentRoi] = useState<number>(1.2);
  const [roiInput, setRoiInput] = useState("1.2");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [tradesRes, roiRes] = await Promise.all([fetchAdminTrades(), fetchAdminTradingRoiSetting()]);
      setItems(tradesRes.data.items || []);
      setCurrentRoi(roiRes.data.tradingROI || 1.2);
      setRoiInput(String(roiRes.data.tradingROI || 1.2));
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load trades");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const onUpdateGlobalRoi = async () => {
    const nextRoi = Number(roiInput);
    if (!Number.isFinite(nextRoi) || nextRoi <= 0) {
      setError("Enter a valid ROI percentage");
      return;
    }
    setRoiLoading(true);
    setMessage("");
    setError("");
    try {
      await updateAdminTradingRoiSetting(nextRoi);
      setCurrentRoi(nextRoi);
      setMessage(`Global trading ROI updated to ${nextRoi}% daily.`);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to update global trading ROI");
    } finally {
      setRoiLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAdjust = async (trade: AdminTradeItem, action: "increase" | "decrease") => {
    const amountInput = window.prompt(`${action === "increase" ? "Increase" : "Decrease"} trading income amount`);
    if (!amountInput) return;
    const reason = window.prompt("Reason", `Admin ${action} trading income`) || "";
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setSubmittingId(trade._id);
    setMessage("");
    setError("");
    try {
      await adjustAdminTradeIncome({ tradeId: trade._id, action, amount, reason });
      setMessage(`Trading income ${action}d successfully.`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to update trading income");
    } finally {
      setSubmittingId("");
    }
  };

  const onSetProfitRate = async (trade: AdminTradeItem) => {
    const current = typeof trade.manualRoiRate === "number" ? trade.manualRoiRate * 100 : 0;
    const input = window.prompt("Set profit percentage per minute", current.toString());
    if (!input) return;
    const profitPercentage = Number(input);
    if (!Number.isFinite(profitPercentage) || profitPercentage < 0) {
      setError("Profit percentage must be a valid number >= 0");
      return;
    }

    setSubmittingId(trade._id);
    setMessage("");
    setError("");
    try {
      await updateAdminTradeProfitRate(trade._id, profitPercentage);
      setMessage("Trade profit percentage updated.");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to set profit percentage");
    } finally {
      setSubmittingId("");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Trading Control</h2>
        <p className="mt-1 text-sm text-slate-300">Global ROI control and per-user income adjustments.</p>
      </div>

      {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <article className="rounded-2xl border border-cyan-700/25 bg-slate-950/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Trading ROI Control</h3>
        <p className="mt-2 text-sm text-slate-300">Current ROI: {currentRoi}% daily</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={roiInput}
            onChange={(event) => setRoiInput(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            className="w-40 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            disabled={roiLoading}
            onClick={onUpdateGlobalRoi}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
          >
            {roiLoading ? "Updating..." : "Update ROI %"}
          </button>
        </div>
      </article>

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-[1100px] divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Trade Amount</th>
              <th className="px-4 py-3">Total Income</th>
              <th className="px-4 py-3">Income Limit</th>
              <th className="px-4 py-3">Profit % / min</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-300">
                  No trades found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-300">
                  Loading trades...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((trade) => {
                const busy = submittingId === trade._id;
                return (
                  <tr key={trade._id}>
                    <td className="px-4 py-3 text-cyan-100">{trade.userId?.userId || "-"}</td>
                    <td className="px-4 py-3 text-slate-200">{money(trade.amount)}</td>
                    <td className="px-4 py-3 text-slate-200">{money(trade.totalIncome)}</td>
                    <td className="px-4 py-3 text-slate-300">{money(trade.investmentLimit)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {typeof trade.manualRoiRate === "number" ? `${(trade.manualRoiRate * 100).toFixed(3)}%` : "Default"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">{trade.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAdjust(trade, "increase")}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          Increase Income
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAdjust(trade, "decrease")}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          Decrease Income
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSetProfitRate(trade)}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          Set Profit %
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminTradesPage;
