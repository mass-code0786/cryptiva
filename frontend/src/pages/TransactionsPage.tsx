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

const tabTypeMap: Partial<Record<HistoryTabKey, string[]>> = {
  trading: ["trading", "trade_start", "TRADE_START", "trade_close", "TRADE_CLOSE"],
  direct: ["referral", "REFERRAL"],
  level: ["level", "LEVEL"],
  salary: ["salary", "SALARY"],
  deposit: ["deposit"],
  withdraw: ["withdraw"],
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

    const selectedTypes = tabTypeMap[activeTab] || [];
    return items.filter((item) => selectedTypes.some((type) => String(item.type || "").toLowerCase() === String(type).toLowerCase()));
  }, [activeTab, items]);

  return (
    <DashboardLayout>
      <h2 className="wallet-title mb-3 text-xl">{tabHeadingMap[activeTab]}</h2>

      <div className="wallet-panel-strong mb-4 p-4">
        <p className="wallet-kicker">Total Withdrawal</p>
        <p className="mt-2 text-2xl font-semibold text-wallet-accentSoft">${totalWithdrawal.toFixed(2)}</p>
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
                  ? "border-wallet-accent/25 bg-wallet-accent/12 text-wallet-accentSoft"
                  : "border-white/10 bg-[#0a1b34]/70 text-wallet-muted hover:border-wallet-accent/20 hover:text-wallet-text"
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
