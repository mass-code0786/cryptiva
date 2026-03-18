import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  blockAdminUser,
  deductAdminFund,
  fetchAdminUsers,
  transferAdminFund,
  unblockAdminUser,
  type AdminPagination,
  type AdminUserItem,
} from "../../services/adminService";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminUsersPage = () => {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [pagination, setPagination] = useState<AdminPagination>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"joinDate" | "income">("joinDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async (page = pagination.page) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminUsers({
        search: search || undefined,
        status,
        sortBy,
        sortOrder,
        page,
        limit: pagination.limit,
      });
      setItems(data.items || []);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load users");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const withAction = async (id: string, fn: () => Promise<unknown>, successMessage: string) => {
    setSubmittingId(id);
    setMessage("");
    setError("");
    try {
      await fn();
      setMessage(successMessage);
      await load(pagination.page);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Action failed");
    } finally {
      setSubmittingId("");
    }
  };

  const onFundTransfer = async (user: AdminUserItem) => {
    const amountInput = window.prompt(`Transfer amount to ${user.userId}`);
    if (!amountInput) return;
    const reason = window.prompt("Reason for transfer", "Admin wallet credit") || "";
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    await withAction(user.id, () => transferAdminFund({ userId: user.id, amount, reason }), `Fund transferred to ${user.userId}`);
  };

  const onFundDeduct = async (user: AdminUserItem) => {
    const amountInput = window.prompt(`Deduct amount from ${user.userId}`);
    if (!amountInput) return;
    const reason = window.prompt("Reason for deduction", "Admin wallet deduction") || "";
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    await withAction(user.id, () => deductAdminFund({ userId: user.id, amount, reason }), `Fund deducted from ${user.userId}`);
  };

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold text-cyan-100">Users</h2>
          <p className="mt-1 text-sm text-slate-300">Search, filter, sort, and manage user status and balances.</p>
        </div>
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            load(1);
          }}
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name/email/user ID"
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 md:col-span-2"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | "active" | "inactive")}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="all">All Users</option>
            <option value="active">Active Users</option>
            <option value="inactive">Inactive Users</option>
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "joinDate" | "income")}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="joinDate">Sort by Join Date</option>
            <option value="income">Sort by Income</option>
          </select>
          <div className="flex gap-2">
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <button type="submit" className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Apply
            </button>
          </div>
        </form>
      </div>

      {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-[1350px] divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Wallet Balance</th>
              <th className="px-4 py-3">Trading Balance</th>
              <th className="px-4 py-3">Total Income</th>
              <th className="px-4 py-3">Referral Count</th>
              <th className="px-4 py-3">Join Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-4 text-slate-300">
                  No users found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-4 text-slate-300">
                  Loading users...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
                const isBusy = submittingId === item.id;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-cyan-100">{item.userId}</td>
                    <td className="px-4 py-3 text-slate-100">{item.name}</td>
                    <td className="px-4 py-3 text-slate-300">{item.email}</td>
                    <td className="px-4 py-3 text-slate-200">{money(item.walletBalance || 0)}</td>
                    <td className="px-4 py-3 text-slate-200">{money(item.tradingBalance || 0)}</td>
                    <td className="px-4 py-3 text-slate-200">{money(item.totalIncome || 0)}</td>
                    <td className="px-4 py-3 text-slate-300">{item.referralCount || 0}</td>
                    <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs uppercase tracking-wide ${
                          item.isActivated ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {item.isActivated ? "Active" : "Inactive"}
                      </span>
                      {item.isBlocked ? <p className="mt-1 text-[11px] text-rose-300">Blocked</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/admin/user/${item.id}`}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                        >
                          View Profile
                        </Link>
                        {item.isBlocked ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => withAction(item.id, () => unblockAdminUser(item.id), `Unblocked ${item.userId}`)}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                          >
                            Unblock User
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => withAction(item.id, () => blockAdminUser(item.id), `Blocked ${item.userId}`)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
                          >
                            Block User
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onFundTransfer(item)}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                        >
                          Transfer Fund
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onFundDeduct(item)}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
                        >
                          Deduct Fund
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
          Page {pagination.page} of {pagination.pages} ({pagination.total} users)
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

export default AdminUsersPage;
