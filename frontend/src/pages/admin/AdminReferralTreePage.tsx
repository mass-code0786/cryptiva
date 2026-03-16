import { useEffect, useState } from "react";
import { fetchAdminReferralTree, type AdminReferralTreeResponse } from "../../services/adminService";

const ReferralNode = ({ node }: { node: AdminReferralTreeResponse["tree"][number] }) => (
  <li className="space-y-1">
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm">
      <p className="font-medium text-cyan-100">
        {node.name} <span className="text-xs text-slate-400">({node.userId})</span>
      </p>
      <p className="text-xs text-slate-300">{node.email}</p>
      <p className="text-xs text-slate-500">Level {node.level || 1}</p>
    </div>
    {node.children.length > 0 && (
      <ul className="ml-4 space-y-1 border-l border-slate-700 pl-3">
        {node.children.map((child) => (
          <ReferralNode key={child.id} node={child} />
        ))}
      </ul>
    )}
  </li>
);

const AdminReferralTreePage = () => {
  const [data, setData] = useState<AdminReferralTreeResponse | null>(null);
  const [userId, setUserId] = useState("");
  const [depth, setDepth] = useState("5");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (nextUserId = userId, nextDepth = depth) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminReferralTree({
        userId: nextUserId || undefined,
        depth: Number(nextDepth) || 5,
      });
      setData(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load referral tree");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("", "5");
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-cyan-100">Referral Tree</h2>
          <p className="mt-1 text-sm text-slate-300">View direct and multi-level referral hierarchy.</p>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load(userId, depth);
          }}
        >
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="User ID (optional)"
            className="w-52 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <input
            value={depth}
            onChange={(event) => setDepth(event.target.value)}
            type="number"
            min="1"
            max="10"
            className="w-24 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <button type="submit" className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
            Load Tree
          </button>
        </form>
      </div>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {loading && <p className="text-sm text-slate-300">Loading referral tree...</p>}

      {!loading && data && (
        <>
          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <p className="text-sm text-slate-300">
              Root User: <span className="font-semibold text-cyan-100">{data.rootUser.userId}</span> ({data.rootUser.name})
            </p>
            <p className="mt-1 text-sm text-slate-300">Total Descendants: {data.totalDescendants}</p>
          </article>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Level Summary</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.levels.map((entry) => (
                <div key={entry.level} className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm">
                  <p className="text-slate-300">Level {entry.level}</p>
                  <p className="text-lg font-semibold text-cyan-100">{entry.users.length}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">Graphical Referral Tree</h3>
            {data.tree.length === 0 ? (
              <p className="mt-3 text-sm text-slate-300">No referrals found for selected user.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.tree.map((node) => (
                  <ReferralNode key={node.id} node={node} />
                ))}
              </ul>
            )}
          </article>
        </>
      )}
    </section>
  );
};

export default AdminReferralTreePage;
