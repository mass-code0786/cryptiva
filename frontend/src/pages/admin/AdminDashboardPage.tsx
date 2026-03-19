import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchAdminDashboardAnalytics,
  fetchAdminDashboardOverview,
  type AdminDashboardAnalytics,
  type AdminDashboardOverview,
} from "../../services/adminService";

const initialOverview: AdminDashboardOverview = {
  users: {
    totalUsers: 0,
    totalActiveUsers: 0,
    totalInactiveUsers: 0,
    todayJoiningUsers: 0,
    todayActiveUsers: 0,
  },
  income: {
    totalTradingIncome: 0,
    todayTradingIncome: 0,
    totalReferralIncome: 0,
    todayReferralIncome: 0,
    totalLevelIncome: 0,
    todayLevelIncome: 0,
    totalSalaryIncome: 0,
    todaySalaryIncome: 0,
  },
  finance: {
    totalWithdrawals: 0,
    todayWithdrawals: 0,
    totalDeposits: 0,
    todayDeposits: 0,
  },
};

const initialAnalytics: AdminDashboardAnalytics = {
  dailyTradingIncome: [],
  weeklyIncome: [],
  monthlyIncome: [],
  userGrowth: [],
  withdrawalChart: [],
  depositChart: [],
};

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const resolveCanonicalLevel = (income: AdminDashboardOverview["income"]) => {
  const canonicalTotal =
    income.totalLevelIncomeCanonical ??
    income.totalLevelIncomeBusiness ??
    income.totalLevelIncomeNet ??
    income.totalLevelIncome;

  const canonicalToday =
    income.todayLevelIncomeCanonical ??
    income.todayLevelIncomeBusiness ??
    income.todayLevelIncomeNet ??
    income.todayLevelIncome;

  return {
    total: Number(canonicalTotal || 0),
    today: Number(canonicalToday || 0),
  };
};

const chartStyle = {
  background: "rgba(15,23,42,0.55)",
  border: "1px solid rgba(8,145,178,0.22)",
  borderRadius: "1rem",
};

const AdminDashboardPage = () => {
  const [overview, setOverview] = useState<AdminDashboardOverview>(initialOverview);
  const [analytics, setAnalytics] = useState<AdminDashboardAnalytics>(initialAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [overviewRes, analyticsRes] = await Promise.all([fetchAdminDashboardOverview(), fetchAdminDashboardAnalytics()]);
        setOverview(overviewRes.data);
        setAnalytics(analyticsRes.data);
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to load admin analytics");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const allCards = useMemo(
    () => {
      const canonicalLevel = resolveCanonicalLevel(overview.income);
      return [
      { label: "Total Users", value: overview.users.totalUsers, currency: false },
      { label: "Active Users", value: overview.users.totalActiveUsers, currency: false },
      { label: "Inactive Users", value: overview.users.totalInactiveUsers, currency: false },
      { label: "Today Joined Users", value: overview.users.todayJoiningUsers, currency: false },
      { label: "Today Active Users", value: overview.users.todayActiveUsers, currency: false },
      { label: "Total Trading Income", value: overview.income.totalTradingIncome, currency: true },
      { label: "Today Trading Income", value: overview.income.todayTradingIncome, currency: true },
      { label: "Total Referral Income", value: overview.income.totalReferralIncome, currency: true },
      { label: "Today Referral Income", value: overview.income.todayReferralIncome, currency: true },
      { label: "Total Level Income", value: canonicalLevel.total, currency: true },
      { label: "Today Level Income", value: canonicalLevel.today, currency: true },
      { label: "Total Salary Income", value: overview.income.totalSalaryIncome, currency: true },
      { label: "Today Salary Income", value: overview.income.todaySalaryIncome, currency: true },
      { label: "Total Withdrawals", value: overview.finance.totalWithdrawals, currency: true },
      { label: "Today Withdrawals", value: overview.finance.todayWithdrawals, currency: true },
      { label: "Total Deposits", value: overview.finance.totalDeposits, currency: true },
      { label: "Today Deposits", value: overview.finance.todayDeposits, currency: true },
    ];
    },
    [overview]
  );

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Admin Dashboard</h2>
        <p className="mt-1 text-sm text-slate-300">Professional analytics and operational insights for Cryptiva.</p>
      </div>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {allCards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-cyan-500/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.82),rgba(2,6,23,0.66))] p-4 backdrop-blur"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-100">
              {loading ? "..." : card.currency ? money(card.value) : card.value.toLocaleString()}
            </p>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="p-4" style={chartStyle}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Daily Trading Income Chart</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailyTradingIncome}>
                <CartesianGrid stroke="rgba(51,65,85,0.4)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="p-4" style={chartStyle}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Weekly Income Chart</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.weeklyIncome}>
                <CartesianGrid stroke="rgba(51,65,85,0.4)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#2dd4bf" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="p-4" style={chartStyle}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Monthly Income Chart</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.monthlyIncome}>
                <CartesianGrid stroke="rgba(51,65,85,0.4)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#38bdf8" fill="rgba(56,189,248,0.3)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="p-4" style={chartStyle}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">User Growth Chart</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.userGrowth}>
                <CartesianGrid stroke="rgba(51,65,85,0.4)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="value" name="Users" stroke="#a78bfa" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="p-4" style={chartStyle}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Withdrawal Chart</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.withdrawalChart}>
                <CartesianGrid stroke="rgba(51,65,85,0.4)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="p-4" style={chartStyle}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Deposit Chart</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.depositChart}>
                <CartesianGrid stroke="rgba(51,65,85,0.4)" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
};

export default AdminDashboardPage;
