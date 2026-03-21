import { useEffect, useMemo, useState } from "react";
import TransactionTable from "../components/TransactionTable";
import DashboardLayout from "../layouts/DashboardLayout";
import { fetchTransactions, type TransactionItem } from "../services/walletService";

type HistoryTabKey = "all" | "trading" | "direct" | "level" | "salary" | "deposit" | "withdraw";

const tabs: { key: HistoryTabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trading", label: "Trading" },
  { key: "direct", label: "Direct" },
  { key: "level", label: "Level" },
  { key: "salary", label: "Salary" },
  { key: "deposit", label: "Deposit" },
  { key: "withdraw", label: "Withdraw" },
];

const tabHeadingMap: Record<HistoryTabKey, string> = {
  all: "Transaction History",
  trading: "Trading History",
  direct: "Direct Income",
  level: "Level Income",
  salary: "Salary Income",
  deposit: "Deposit History",
  withdraw: "Withdrawal History",
};

const tabTypeMap: Partial<Record<HistoryTabKey, TransactionItem["type"]>> = {
  trading: "trading",
  direct: "referral",
  level: "level",
  salary: "salary",
  deposit: "deposit",
  withdraw: "withdraw",
};

const TransactionsPage = () => {
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [totalWithdrawal, setTotalWithdrawal] = useState(0);
  const [activeTab, setActiveTab] = useState<HistoryTabKey>("all");

  useEffect(() => {
    fetchTransactions()
      .then((res) => {
        setItems(res.data.items || []);
        setTotalWithdrawal(Number(res.data.summary?.totalWithdrawalCompleted || 0));
      })
      .catch(() => {
        setItems([]);
        setTotalWithdrawal(0);
      });
  }, []);

  const filteredItems = useMemo(() => {
    if (activeTab === "all") {
      return items;
    }

    const selectedType = tabTypeMap[activeTab];
    return items.filter((item) => String(item.type || "").toLowerCase() === String(selectedType || "").toLowerCase());
  }, [activeTab, items]);

  return (
    <DashboardLayout>
      <h2 className="mb-3 text-xl font-semibold">{tabHeadingMap[activeTab]}</h2>

      <div className="mb-4 rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Total Withdrawal</p>
        <p className="mt-2 text-2xl font-semibold text-cyan-200">${totalWithdrawal.toFixed(2)}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                  : "border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <TransactionTable items={filteredItems} />
    </DashboardLayout>
  );
};

export default TransactionsPage;
