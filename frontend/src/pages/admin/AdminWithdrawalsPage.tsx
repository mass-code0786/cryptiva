import { useEffect, useState } from "react";
import {
  approveAdminWithdrawal,
  fetchAdminWithdrawals,
  rejectAdminWithdrawal,
  type AdminPagination,
  type AdminWithdrawalItem,
} from "../../services/adminService";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminWithdrawalsPage = () => {
  const [items, setItems] = useState<AdminWithdrawalItem[]>([]);
  const [pagination, setPagination] = useState<AdminPagination>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async (page = pagination.page) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminWithdrawals({ page, limit: pagination.limit });
      setItems(data.items || []);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load withdrawals");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const onApprove = async (withdrawalId: string) => {
    setSubmittingId(withdrawalId);
    setMessage("");
    setError("");
    try {
      await approveAdminWithdrawal(withdrawalId);
      setMessage("Withdrawal approved.");
      await load(pagination.page);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to approve withdrawal");
    } finally {
      setSubmittingId("");
    }
  };

  const onReject = async (withdrawalId: string) => {
    const reason = window.prompt("Enter rejection reason", "Rejected by admin");
    if (!reason) return;
    setSubmittingId(withdrawalId);
    setMessage("");
    setError("");
    try {
      await rejectAdminWithdrawal(withdrawalId, reason);
      setMessage("Withdrawal rejected.");
      await load(pagination.page);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to reject withdrawal");
    } finally {
      setSubmittingId("");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Withdrawals</h2>
        <p className="mt-1 text-sm text-slate-300">Approve/reject pending withdrawal requests with audit logging.</p>
      </div>

      {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-full divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Requested Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-300">
                  No withdrawal records found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-300">
                  Loading withdrawals...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
                const isPending = item.status === "pending";
                const busy = submittingId === item._id;
                return (
                  <tr key={item._id}>
                    <td className="px-4 py-3 text-cyan-100">{item.userId?.userId || "-"}</td>
                    <td className="px-4 py-3 text-slate-200">{money(item.amount)}</td>
                    <td className="px-4 py-3 text-slate-300">{item.destination}</td>
                    <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">
                        {item.status === "completed" ? "Approved" : item.status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!isPending || busy}
                          onClick={() => onApprove(item._id)}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={!isPending || busy}
                          onClick={() => onReject(item._id)}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
        <p>
          Page {pagination.page} of {pagination.pages} ({pagination.total} withdrawals)
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

export default AdminWithdrawalsPage;
