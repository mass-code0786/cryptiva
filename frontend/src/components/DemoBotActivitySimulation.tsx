import { useEffect, useMemo, useState } from "react";

type SimulatedBotEntry = {
  id: string;
  asset: "BTC" | "BNB" | "ETH" | "SOL" | "XRP";
  type: "Profit" | "Loss";
  amount: number;
  createdAt: number;
  badge: "Demo";
};

const demoBotHistory = "demoBotHistory";
const simulationAssets: SimulatedBotEntry["asset"][] = ["BTC", "BNB", "ETH", "SOL", "XRP"];
const generationIntervalMs = 3 * 60 * 60 * 1000;
const maxHistory = 80;

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const buildSimulatedEntry = (createdAt: number): SimulatedBotEntry => {
  const isProfit = Math.random() >= 0.5;
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 9)}`,
    asset: simulationAssets[randomInt(0, simulationAssets.length - 1)],
    type: isProfit ? "Profit" : "Loss",
    amount: isProfit ? randomInt(3000, 10000) : randomInt(1000, 3000),
    createdAt,
    badge: "Demo",
  };
};

const parseStoredHistory = (): SimulatedBotEntry[] => {
  try {
    const raw = localStorage.getItem(demoBotHistory);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is SimulatedBotEntry =>
        typeof entry?.id === "string" &&
        simulationAssets.includes(entry?.asset) &&
        (entry?.type === "Profit" || entry?.type === "Loss") &&
        typeof entry?.amount === "number" &&
        typeof entry?.createdAt === "number" &&
        entry?.badge === "Demo"
    );
  } catch {
    return [];
  }
};

const persistHistory = (entries: SimulatedBotEntry[]) => {
  localStorage.setItem(demoBotHistory, JSON.stringify(entries));
};

const formatAmount = (value: number) => `$${value.toLocaleString()}`;

const DemoBotActivitySimulation = () => {
  const [history, setHistory] = useState<SimulatedBotEntry[]>([]);

  useEffect(() => {
    const initializeHistory = () => {
      const now = Date.now();
      const stored = parseStoredHistory().sort((a, b) => b.createdAt - a.createdAt);

      let next = [...stored];
      if (next.length === 0) {
        next = [buildSimulatedEntry(now)];
      } else {
        let latest = next[0].createdAt;
        while (now - latest >= generationIntervalMs) {
          latest += generationIntervalMs;
          next.unshift(buildSimulatedEntry(latest));
        }
      }

      const ordered = next.slice(0, maxHistory).sort((a, b) => b.createdAt - a.createdAt);
      setHistory(ordered);
      persistHistory(ordered);
    };

    initializeHistory();

    const timer = window.setInterval(() => {
      setHistory((current) => {
        const now = Date.now();
        const ordered = [...current].sort((a, b) => b.createdAt - a.createdAt);

        let next = [...ordered];
        let latest = next[0]?.createdAt ?? now;
        if (next.length === 0) {
          next = [buildSimulatedEntry(now)];
        } else {
          while (now - latest >= generationIntervalMs) {
            latest += generationIntervalMs;
            next.unshift(buildSimulatedEntry(latest));
          }
        }

        const capped = next.slice(0, maxHistory).sort((a, b) => b.createdAt - a.createdAt);
        persistHistory(capped);
        return capped;
      });
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => [...history].sort((a, b) => b.createdAt - a.createdAt), [history]);

  const summary = useMemo(() => {
    const profitCount = rows.filter((item) => item.type === "Profit").length;
    const lossCount = rows.filter((item) => item.type === "Loss").length;
    const lastUpdate = rows[0]?.createdAt ?? null;

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
      <div className="rounded-xl border border-wallet-accent/20 bg-wallet-bg/55 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-wallet-accent sm:text-lg">Bot Activity Simulation</h2>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-wallet-accent/45 bg-wallet-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-wallet-accent">
              Demo Only
            </span>
            <span className="rounded-full border border-wallet-accentAlt/45 bg-wallet-accentAlt/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-wallet-accentAlt">
              Simulated Data
            </span>
            <span className="rounded-full border border-wallet-border bg-wallet-panelAlt/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-wallet-muted">
              Not Connected to Real Trading
            </span>
          </div>
        </div>
        <p className="text-sm text-wallet-text">
          This panel displays simulated market activity for presentation purposes only. It does not represent real trades, real profit, or actual wallet movements.
        </p>
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
          <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/90">Simulated Profits</p>
          <p className="mt-1 text-lg font-semibold text-emerald-400">{summary.profitCount}</p>
        </div>
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-rose-200/90">Simulated Losses</p>
          <p className="mt-1 text-lg font-semibold text-rose-400">{summary.lossCount}</p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-wallet-border">
        <div className="hidden grid-cols-6 gap-2 border-b border-wallet-border bg-wallet-panelAlt/80 px-3 py-2 text-[11px] uppercase tracking-[0.13em] text-wallet-muted sm:grid">
          <span>Asset</span>
          <span>Type</span>
          <span>Amount</span>
          <span>Date</span>
          <span>Time</span>
          <span>Badge</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto bg-wallet-panel/65">
          {rows.length === 0 && <p className="p-3 text-sm text-wallet-muted">No simulated entries available yet.</p>}
          {rows.map((entry) => {
            const date = new Date(entry.createdAt);
            const isProfit = entry.type === "Profit";
            const dateLabel = date.toLocaleDateString();
            const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <div
                key={entry.id}
                className="grid grid-cols-2 gap-2 border-b border-wallet-border/70 px-3 py-3 text-sm text-wallet-text last:border-b-0 sm:grid-cols-6 sm:items-center"
              >
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Asset: </span>
                  <span className="font-semibold">{entry.asset}</span>
                </p>
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Type: </span>
                  <span className={isProfit ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{entry.type}</span>
                </p>
                <p>
                  <span className="text-xs uppercase tracking-[0.12em] text-wallet-muted sm:hidden">Amount: </span>
                  <span className={isProfit ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{formatAmount(entry.amount)}</span>
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
                    {entry.badge}
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
