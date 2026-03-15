import { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import {
  approveAdminWithdrawal,
  fetchAdminWithdrawals,
  type AdminWithdrawalItem,
} from "../services/adminService";

const AdminPage = () => {
  const [items, setItems] = useState<AdminWithdrawalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchAdminWithdrawals();
      setItems(data.items || []);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Failed to load withdrawal requests");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onApprove = async (withdrawalId: string) => {
    setMessage("");
    try {
      await approveAdminWithdrawal(withdrawalId);
      setMessage("Withdrawal marked as completed.");
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Failed to update request");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h2 className="text-2xl font-semibold">Admin Withdrawals</h2>
          <p className="mt-1 text-sm text-slate-400">
            Review pending requests, send USDT manually, then mark them completed.
          </p>
          {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
        </div>

        <div className="space-y-3">
          {loading && (
            <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4 text-sm text-slate-300">
              Loading requests...
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4 text-sm text-slate-300">
              No withdrawal requests found.
            </div>
          )}
          {!loading &&
            items.map((item) => (
              <div key={item._id} className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-cyan-200">{item.user?.name || "User"}</p>
                    <p className="text-xs text-slate-400">{item.user?.email || "-"}</p>
                    <p className="mt-1 text-xs text-slate-400">ID: {item.user?.userId || "-"}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      item.status === "completed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : item.status === "rejected"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-slate-400">Amount:</span> ${item.amount.toFixed(2)}
                  </p>
                  <p>
                    <span className="text-slate-400">Network:</span> {item.network}
                  </p>
                  <p className="sm:col-span-2 break-all">
                    <span className="text-slate-400">Destination:</span> {item.destination}
                  </p>
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    Requested: {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>

                {item.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => onApprove(item._id)}
                    className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Mark Completed
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminPage;
