import { useEffect, useState } from "react";
import { fetchAdminDeposits, fetchAdminTrades, fetchAdminUsers, fetchAdminWithdrawals } from "../../services/adminService";

type Totals = {
  users: number;
  deposits: number;
  withdrawals: number;
  trades: number;
};

const AdminDashboardPage = () => {
  const [totals, setTotals] = useState<Totals>({ users: 0, deposits: 0, withdrawals: 0, trades: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersRes, depositsRes, withdrawalsRes, tradesRes] = await Promise.all([
          fetchAdminUsers(),
          fetchAdminDeposits(),
          fetchAdminWithdrawals(),
          fetchAdminTrades(),
        ]);
        setTotals({
          users: usersRes.data.pagination?.total || usersRes.data.items?.length || 0,
          deposits: depositsRes.data.total ?? depositsRes.data.pagination?.total ?? depositsRes.data.items?.length ?? 0,
          withdrawals:
            withdrawalsRes.data.total ?? withdrawalsRes.data.pagination?.total ?? withdrawalsRes.data.items?.length ?? 0,
          trades: tradesRes.data.total ?? tradesRes.data.pagination?.total ?? tradesRes.data.items?.length ?? 0,
        });
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to load admin dashboard");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Admin Dashboard</h2>
        <p className="mt-1 text-sm text-slate-300">Platform overview for users, deposits, withdrawals, and trades.</p>
      </div>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Users", value: totals.users },
          { label: "Total Deposits", value: totals.deposits },
          { label: "Total Withdrawals", value: totals.withdrawals },
          { label: "Total Trades", value: totals.trades },
        ].map((card) => (
          <article key={card.label} className="rounded-2xl border border-cyan-600/25 bg-slate-950/55 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-cyan-100">{loading ? "..." : card.value.toLocaleString()}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default AdminDashboardPage;
