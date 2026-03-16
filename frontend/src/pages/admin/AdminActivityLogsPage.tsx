import { useEffect, useState } from "react";
import { fetchAdminActivityLogs, type AdminActivityLogItem, type AdminPagination } from "../../services/adminService";

const AdminActivityLogsPage = () => {
  const [items, setItems] = useState<AdminActivityLogItem[]>([]);
  const [pagination, setPagination] = useState<AdminPagination>({ page: 1, limit: 25, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (page = pagination.page) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminActivityLogs({ search: search || undefined, page, limit: pagination.limit });
      setItems(data.items || []);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load activity logs");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-cyan-100">Activity Logs</h2>
          <p className="mt-1 text-sm text-slate-300">Admin actions: block, withdrawals, transfers, deductions.</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action/admin/user"
            className="w-56 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <button type="submit" className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
            Search
          </button>
        </form>
      </div>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-full divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Admin ID</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-300">
                  No activity logs found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-300">
                  Loading activity logs...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => (
                <tr key={item._id}>
                  <td className="px-4 py-3 text-cyan-100">{item.adminId?.userId || "-"}</td>
                  <td className="px-4 py-3 text-slate-100">{item.action}</td>
                  <td className="px-4 py-3 text-slate-300">{item.targetUserId?.userId || "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{typeof item.amount === "number" ? item.amount.toFixed(2) : "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
        <p>
          Page {pagination.page} of {pagination.pages} ({pagination.total} logs)
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1 || loading}
            onClick={() => load(pagination.page - 1)}
            className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={pagination.page >= pagination.pages || loading}
            onClick={() => load(pagination.page + 1)}
            className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
};

export default AdminActivityLogsPage;
