import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import IncomeCard from "../components/IncomeCard";
import WalletCard from "../components/WalletCard";
import DashboardLayout from "../layouts/DashboardLayout";
import { downloadPopupBannerImage, fetchActivePopupBanner, type PopupBannerItem } from "../services/popupBannerService";
import { fetchSalaryProgress, type SalaryProgress } from "../services/userService";
import { fetchTransactions, fetchWallet, type TransactionItem, type Wallet } from "../services/walletService";

const formatCurrency = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const popupDismissKey = (bannerId: string) => `dashboard_popup_banner_dismissed_${bannerId}`;

const DashboardPage = () => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [recent, setRecent] = useState<TransactionItem[]>([]);
  const [popupBanner, setPopupBanner] = useState<PopupBannerItem | null>(null);
  const [showPopupBanner, setShowPopupBanner] = useState(false);
  const [downloadingBanner, setDownloadingBanner] = useState(false);
  const [salaryRankProgress, setSalaryRankProgress] = useState<SalaryProgress>({
    currentRank: "Rank 0",
    nextRank: "Rank 1",
    mainLegBusiness: 0,
    otherLegBusiness: 0,
    remainingMainLeg: 2000,
    remainingOtherLeg: 3000,
    weeklySalary: 0,
    progressPercentage: 0,
  });

  useEffect(() => {
    const loadSalary = () =>
      fetchSalaryProgress()
        .then((res) => setSalaryRankProgress(res.data))
        .catch(() =>
          setSalaryRankProgress((prev) => ({
            ...prev,
            currentRank: "Rank 0",
            nextRank: "Rank 1",
            progressPercentage: 0,
          }))
        );

    fetchWallet()
      .then((res) => setWallet(res.data.wallet))
      .catch(() =>
        setWallet({
          userId: "",
          depositWallet: 0,
          withdrawalWallet: 0,
          balance: 0,
          tradingWallet: 0,
          depositTotal: 0,
          withdrawTotal: 0,
          p2pTotal: 0,
        })
      );
    fetchTransactions()
      .then((res) => {
        const items = res.data.items || [];
        setTransactions(items);
        setRecent(items.slice(0, 5));
      })
      .catch(() => {
        setTransactions([]);
        setRecent([]);
      });
    fetchActivePopupBanner()
      .then((res) => {
        const item = res.data?.item || null;
        setPopupBanner(item);
        if (!item?._id) {
          setShowPopupBanner(false);
          return;
        }
        const dismissed = sessionStorage.getItem(popupDismissKey(item._id)) === "1";
        setShowPopupBanner(!dismissed);
      })
      .catch(() => {
        setPopupBanner(null);
        setShowPopupBanner(false);
      });
    loadSalary();
    const timer = window.setInterval(loadSalary, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const incomeSummary = useMemo(() => {
    const tradingIncome = Number(wallet?.tradingIncome || 0);
    const referralIncome = Number(wallet?.referralIncome || 0);
    const levelIncome = Number(wallet?.levelIncome || 0);
    const salaryIncome = Number(wallet?.salaryIncome || 0);
    const totalIncome = Number(wallet?.totalIncome || tradingIncome + referralIncome + levelIncome + salaryIncome);

    return {
      trading: tradingIncome,
      referral: referralIncome,
      level: levelIncome,
      salary: salaryIncome,
      total: totalIncome,
    };
  }, [wallet]);

  const capSummary = useMemo(() => {
    const isWorkingUser = Boolean(wallet?.isWorkingUser);
    const capMultiplier = Number(wallet?.capMultiplier ?? (isWorkingUser ? 4 : 2.5));
    const currentCapAmount = Number(wallet?.currentCapAmount || 0);
    const totalIncomeCounted = Number(wallet?.totalIncomeCounted || 0);
    const remainingCap = Number(wallet?.remainingCap || 0);

    return {
      isWorkingUser,
      capMultiplier,
      currentCapAmount,
      totalIncomeCounted,
      remainingCap,
    };
  }, [wallet]);

  return (
    <DashboardLayout>
      {showPopupBanner && popupBanner && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-700/40 bg-slate-950 shadow-[0_30px_70px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem(popupDismissKey(popupBanner._id), "1");
                setShowPopupBanner(false);
              }}
              className="absolute right-2 top-2 z-10 rounded-full border border-slate-700/80 bg-slate-900/90 p-1.5 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-100"
              aria-label="Close popup banner"
            >
              <X size={16} />
            </button>

            <div className="p-3 sm:p-4">
              {popupBanner.title && <p className="mb-2 text-sm font-semibold text-cyan-100">{popupBanner.title}</p>}
              {popupBanner.targetUrl ? (
                <a href={popupBanner.targetUrl} target="_blank" rel="noreferrer">
                  <img
                    src={popupBanner.imageUrl}
                    alt={popupBanner.title || "Dashboard popup banner"}
                    className="max-h-[70vh] w-full rounded-xl object-contain"
                  />
                </a>
              ) : (
                <img
                  src={popupBanner.imageUrl}
                  alt={popupBanner.title || "Dashboard popup banner"}
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <a
                  href="#"
                  onClick={async (event) => {
                    event.preventDefault();
                    if (!popupBanner?._id || downloadingBanner) return;
                    setDownloadingBanner(true);
                    try {
                      await downloadPopupBannerImage(popupBanner);
                    } finally {
                      setDownloadingBanner(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20"
                >
                  <Download size={16} />
                  {downloadingBanner ? "Downloading..." : "Download"}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        <WalletCard
          depositWallet={wallet?.depositWallet || 0}
          withdrawalWallet={wallet?.withdrawalWallet || 0}
          tradingWallet={wallet?.tradingWallet || wallet?.tradingBalance || 0}
        />
        <section className="rounded-2xl border border-cyan-900/40 bg-slate-900/50 p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-200 sm:text-base">Income Summary</h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Crypto Earnings</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible">
            <div className="min-w-[150px] md:min-w-0">
              <IncomeCard title="Total Income" amount={incomeSummary.total} tone="cyan" icon="total" />
            </div>
            <div className="min-w-[150px] md:min-w-0">
              <IncomeCard title="Trading Income" amount={incomeSummary.trading} tone="blue" icon="trading" />
            </div>
            <div className="min-w-[150px] md:min-w-0">
              <IncomeCard title="Referral Income" amount={incomeSummary.referral} tone="violet" icon="direct" />
            </div>
            <div className="min-w-[150px] md:min-w-0">
              <IncomeCard title="Level Income" amount={incomeSummary.level} tone="blue" icon="level" />
            </div>
            <div className="min-w-[150px] md:min-w-0">
              <IncomeCard title="Salary Income" amount={incomeSummary.salary} tone="cyan" icon="salary" />
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-200 sm:text-base">Income Cap Status</h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
              {capSummary.isWorkingUser ? "Working User" : "Non-Working User"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm text-slate-200 sm:grid-cols-2">
            <p>
              <span className="text-slate-400">Cap Multiplier:</span> {capSummary.capMultiplier}x
            </p>
            <p>
              <span className="text-slate-400">Current Cap:</span> {formatCurrency(capSummary.currentCapAmount)}
            </p>
            <p>
              <span className="text-slate-400">Income Counted:</span> {formatCurrency(capSummary.totalIncomeCounted)}
            </p>
            <p>
              <span className="text-slate-400">Remaining Cap:</span> {formatCurrency(capSummary.remainingCap)}
            </p>
          </div>
        </section>
        <section className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900/95 to-cyan-950/40 p-4 shadow-[0_0_28px_rgba(34,211,238,0.16)] sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-200 sm:text-base">Salary Rank Progress</h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Team Growth</span>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm text-slate-200 sm:grid-cols-2">
            <p>
              <span className="text-slate-400">Current Rank:</span> {salaryRankProgress.currentRank}
            </p>
            <p>
              <span className="text-slate-400">Next Rank:</span> {salaryRankProgress.nextRank}
            </p>
            <p>
              <span className="text-slate-400">Next Rank Target:</span> {salaryRankProgress.nextRankTarget || "-"}
            </p>
            <p>
              <span className="text-slate-400">Main Leg Business:</span> {formatCurrency(salaryRankProgress.mainLegBusiness)}
            </p>
            <p>
              <span className="text-slate-400">Other Legs Business:</span> {formatCurrency(salaryRankProgress.otherLegBusiness)}
            </p>
            <p>
              <span className="text-slate-400">Remaining Main Leg:</span> {formatCurrency(salaryRankProgress.remainingMainLeg)}
            </p>
            <p>
              <span className="text-slate-400">Remaining Other Leg:</span> {formatCurrency(salaryRankProgress.remainingOtherLeg)}
            </p>
            <p className="sm:col-span-2">
              <span className="text-slate-400">Remaining Business:</span>{" "}
              {formatCurrency(
                Number(salaryRankProgress.remainingBusiness ?? salaryRankProgress.remainingMainLeg + salaryRankProgress.remainingOtherLeg)
              )}
            </p>
            <p className="sm:col-span-2">
              <span className="text-slate-400">Weekly Salary:</span> {formatCurrency(salaryRankProgress.weeklySalary)}
            </p>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-400">Progress</p>
            <div className="h-3 w-full rounded-full bg-slate-700">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 transition-all duration-700 ease-out"
                style={{ width: `${salaryRankProgress.progressPercentage}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-emerald-300">{salaryRankProgress.progressPercentage.toFixed(1)}%</p>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-3">
            <p className="text-xs text-slate-400">P2P Total</p>
            <p className="mt-1 text-lg font-semibold">${(wallet?.p2pTotal || 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-3">
            <p className="text-xs text-slate-400">Recent Entries</p>
            <p className="mt-1 text-lg font-semibold">{recent.length}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h2 className="text-sm font-semibold text-cyan-200">Latest Transactions</h2>
          <div className="mt-3 space-y-2 text-sm">
            {recent.length === 0 && <p className="text-slate-400">No transaction history available.</p>}
            {recent.map((item) => (
              <div key={item._id} className="flex items-center justify-between rounded-xl bg-slate-800/60 px-3 py-2">
                <span className="uppercase text-xs text-slate-300">{item.type}</span>
                <span className="font-semibold">${item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
