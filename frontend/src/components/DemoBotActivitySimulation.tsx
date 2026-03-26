import { Bot } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchDemoBotFeed, type DemoBotFeedItem } from "../services/demoBotService";
import { fetchSetting } from "../services/settingsService";

const DISCLAIMER_FALLBACK = "Live market overview";

const formatAmount = (value: number) => `$${Number(value || 0).toLocaleString()}`;

const DemoBotActivitySimulation = () => {
  const [rows, setRows] = useState<DemoBotFeedItem[]>([]);
  const [disclaimer, setDisclaimer] = useState(DISCLAIMER_FALLBACK);

  useEffect(() => {
    let active = true;

    const loadFeed = async () => {
      try {
        const response = await fetchDemoBotFeed(60);
        if (!active) return;
        setRows(response.data.items || []);
      } catch {
        if (!active) return;
        setRows([]);
      }
    };

    const loadDisclaimer = async () => {
      try {
        const response = await fetchSetting("demo_bot_disclaimer");
        if (!active) return;
        const value = String(response.data.value || "").trim();
        setDisclaimer(value || DISCLAIMER_FALLBACK);
      } catch {
        if (!active) return;
        setDisclaimer(DISCLAIMER_FALLBACK);
      }
    };

    loadFeed().catch(() => {});
    loadDisclaimer().catch(() => {});
    const timer = window.setInterval(() => {
      loadFeed().catch(() => {});
    }, 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    const profitCount = rows.filter((item) => item.resultType === "profit").length;
    const lossCount = rows.filter((item) => item.resultType === "loss").length;
    const lastUpdate = rows[0]?.createdAt || "";
    return {
      totalEntries: rows.length,
      profitCount,
      lossCount,
      lastUpdateLabel: lastUpdate
        ? new Date(lastUpdate).toLocaleString([], {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "No updates yet",
    };
  }, [rows]);

  return (
    <section className="wallet-panel-strong border border-wallet-accent/25 bg-gradient-to-b from-wallet-panelAlt/70 to-wallet-panel/95 p-4 shadow-[0_12px_34px_rgb(var(--wallet-shadow-color)/0.24)] sm:p-5">
      <div className="rounded-xl border border-wallet-border/70 bg-wallet-bg/45 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-wallet-accent/35 bg-wallet-panelAlt/85 p-2.5 shadow-[0_6px_16px_rgb(var(--wallet-shadow-color)/0.25)]">
              <Bot size={18} className="text-wallet-accent" />
            </div>
            <h2 className="text-base font-semibold text-wallet-accent sm:text-lg">LiveCryptiva Bot</h2>
          </div>
          <span className="inline-flex animate-pulse items-center rounded-full border border-emerald-400/55 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            LIVE BOT
          </span>
        </div>
        <p className="text-xs text-wallet-muted">{disclaimer}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-wallet-muted">Total Entries</p>
          <p className="mt-1 text-lg font-semibold text-wallet-text">{summary.totalEntries}</p>
        </div>
        <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-wallet-muted">Last Update</p>
          <p className="mt-1 text-sm font-semibold text-wallet-text">{summary.lastUpdateLabel}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/90">Trading Profits</p>
          <p className="mt-1 text-lg font-semibold text-emerald-400">{summary.profitCount}</p>
        </div>
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-rose-200/90">Trading Losses</p>
          <p className="mt-1 text-lg font-semibold text-rose-400">{summary.lossCount}</p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-wallet-border">
        <div className="hidden grid-cols-6 gap-2 border-b border-wallet-border bg-wallet-panelAlt/80 px-3 py-2 text-[11px] uppercase tracking-[0.13em] text-wallet-muted sm:grid">
          <span>Asset</span>
          <span>Result</span>
          <span>Amount</span>
          <span>Date</span>
          <span>Time</span>
          <span>Badge</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto bg-wallet-panel/65">
          {rows.length === 0 && <p className="p-3 text-sm text-wallet-muted">No profit/loss entries available yet.</p>}
          {rows.map((entry) => {
            const date = new Date(entry.createdAt);
            const isProfit = entry.resultType === "profit";
            const typeLabel = isProfit ? "Profit" : "Loss";
            const dateLabel = date.toLocaleDateString();
            const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <div
                key={entry._id}
                className="grid grid-cols-2 gap-2 border-b border-wallet-border/70 px-3 py-3 text-sm text-wallet-text last:border-b-0 sm:grid-cols-6 sm:items-center"
              >
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Asset: </span>
                  <span className="font-semibold">{entry.asset}</span>
                </p>
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Result: </span>
                  <span className={isProfit ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{typeLabel}</span>
                </p>
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Amount: </span>
                  <span className={isProfit ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>
                    {formatAmount(entry.amount)}
                  </span>
                </p>
                <p className="text-wallet-muted">
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Date: </span>
                  {dateLabel}
                </p>
                <p className="text-wallet-muted">
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Time: </span>
                  {timeLabel}
                </p>
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Badge: </span>
                  <span className="inline-flex rounded-full border border-wallet-accent/35 bg-wallet-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-wallet-accent">
                    LIVE
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DemoBotActivitySimulation;
