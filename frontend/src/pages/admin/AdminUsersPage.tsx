import { useEffect, useState } from "react";
import { fetchAdminUsers, type AdminUserItem } from "../../services/adminService";

const AdminUsersPage = () => {
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await fetchAdminUsers();
        setItems(data.items || []);
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to load users");
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
        <h2 className="text-2xl font-semibold text-cyan-100">Users</h2>
        <p className="mt-1 text-sm text-slate-300">All registered users with role and referral metadata.</p>
      </div>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-full divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/60 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-slate-300">
                  No users found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-slate-300">
                  Loading users...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-slate-100">{item.name}</td>
                  <td className="px-4 py-3 text-slate-300">{item.email}</td>
                  <td className="px-4 py-3 text-slate-300">{item.userId}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-200">
                      {item.role || (item.isAdmin ? "admin" : "user")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminUsersPage;
