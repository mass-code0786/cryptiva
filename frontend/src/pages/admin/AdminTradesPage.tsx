import { useEffect, useState } from "react";
import { fetchAdminTrades, type AdminTradeItem } from "../../services/adminService";

const getUser = (user: AdminTradeItem["userId"]) => ({
  name: user?.name || "User",
  email: user?.email || "-",
  userId: user?.userId || "-",
});

const AdminTradesPage = () => {
  const [items, setItems] = useState<AdminTradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await fetchAdminTrades();
        setItems(data.items || []);
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to load trades");
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Trades</h2>
        <p className="mt-1 text-sm text-slate-300">Live trade monitor with status and earned income.</p>
      </div>
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-full divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/60 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Income</th>
              <th className="px-4 py-3">Limit</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-slate-300">
                  No trades found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-slate-300">
                  Loading trades...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
                const user = getUser(item.userId);
                return (
                  <tr key={item._id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-200">${item.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-200">${item.totalIncome.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-300">${item.investmentLimit.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">
                        {item.status}
                      </span>
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
