import { useEffect, useState } from "react";
import { approveAdminDeposit, fetchAdminDeposits, type AdminDepositItem } from "../../services/adminService";

const getUser = (user: AdminDepositItem["userId"]) => ({
  name: user?.name || "User",
  email: user?.email || "-",
  userId: user?.userId || "-",
});

const AdminDepositsPage = () => {
  const [items, setItems] = useState<AdminDepositItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminDeposits();
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load deposits");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onApprove = async (depositId: string) => {
    setMessage("");
    setError("");
    try {
      await approveAdminDeposit(depositId);
      setMessage("Deposit approved.");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to approve deposit");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Deposits</h2>
        <p className="mt-1 text-sm text-slate-300">Review incoming deposits and approve pending ones.</p>
      </div>
      {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="space-y-3">
        {loading && <p className="rounded-xl border border-cyan-700/25 bg-slate-950/45 px-3 py-3 text-sm text-slate-300">Loading deposits...</p>}
        {!loading && items.length === 0 && (
          <p className="rounded-xl border border-cyan-700/25 bg-slate-950/45 px-3 py-3 text-sm text-slate-300">No deposits found.</p>
        )}
        {!loading &&
          items.map((item) => {
            const user = getUser(item.userId);
            const canApprove = item.status === "pending";
            return (
              <article key={item._id} className="rounded-2xl border border-cyan-700/25 bg-slate-950/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-cyan-100">{user.name}</p>
                    <p className="text-xs text-slate-300">{user.email}</p>
                    <p className="text-xs text-slate-400">ID: {user.userId}</p>
                  </div>
                  <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">{item.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-slate-400">Amount:</span> ${item.amount.toFixed(2)}
                  </p>
                  <p>
                    <span className="text-slate-400">Network:</span> {item.network}
                  </p>
                  <p>
                    <span className="text-slate-400">Currency:</span> {item.currency}
                  </p>
                  <p className="text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                {canApprove && (
                  <button
                    type="button"
                    onClick={() => onApprove(item._id)}
                    className="mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
                  >
                    Approve Deposit
                  </button>
                )}
              </article>
            );
          })}
      </div>
    </section>
  );
};

export default AdminDepositsPage;
