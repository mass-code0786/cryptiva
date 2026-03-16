import { FormEvent, useEffect, useState } from "react";
import {
  approveAdminSupportQuery,
  fetchAdminSupportQueries,
  rejectAdminSupportQuery,
  replyAdminSupportQuery,
  type AdminPagination,
  type AdminSupportQueryItem,
} from "../../services/adminService";

const AdminSupportQueriesPage = () => {
  const [items, setItems] = useState<AdminSupportQueryItem[]>([]);
  const [pagination, setPagination] = useState<AdminPagination>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "pending" | "approved" | "rejected">("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async (page = pagination.page) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminSupportQueries({
        search: search || undefined,
        status: status || undefined,
        page,
        limit: pagination.limit,
      });
      setItems(data.items || []);
      setPagination(data.pagination);
    } catch {
      setItems([]);
      setError("Failed to load support queries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const runAction = async (queryId: string, fn: () => Promise<unknown>, successMessage: string) => {
    setSubmittingId(queryId);
    setMessage("");
    setError("");
    try {
      await fn();
      setMessage(successMessage);
      await load(pagination.page);
    } catch {
      setError("Action failed");
    } finally {
      setSubmittingId("");
    }
  };

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    load(1);
  };

  const onReply = async (item: AdminSupportQueryItem) => {
    const reply = window.prompt(`Reply for ${item.userId?.userId || "user"}`, item.adminReply || "");
    if (!reply) return;
    await runAction(item._id, () => replyAdminSupportQuery(item._id, reply), "Reply saved");
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-cyan-100">Support Queries</h2>
          <p className="mt-1 text-sm text-slate-300">Handle user queries, replies, approvals and rejections.</p>
        </div>
        <form onSubmit={onSearch} className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user/subject/message"
            className="w-56 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | "pending" | "approved" | "rejected")}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button type="submit" className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
            Search
          </button>
        </form>
      </div>

      {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-[1100px] divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Reply</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-300">
                  No support queries found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-300">
                  Loading support queries...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
                const busy = submittingId === item._id;
                return (
                  <tr key={item._id}>
                    <td className="px-4 py-3 text-cyan-100">{item.userId?.userId || "-"}</td>
                    <td className="px-4 py-3 text-slate-100">{item.subject}</td>
                    <td className="px-4 py-3 text-slate-300">{item.message}</td>
                    <td className="px-4 py-3 text-slate-300">{item.adminReply || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">{item.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onReply(item)}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          Reply
                        </button>
                        <button
                          type="button"
                          disabled={busy || item.status === "approved"}
                          onClick={() =>
                            runAction(item._id, () => approveAdminSupportQuery(item._id), `Approved query ${item._id.slice(-6)}`)
                          }
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy || item.status === "rejected"}
                          onClick={() =>
                            runAction(item._id, () => rejectAdminSupportQuery(item._id), `Rejected query ${item._id.slice(-6)}`)
                          }
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
    </section>
  );
};

export default AdminSupportQueriesPage;
