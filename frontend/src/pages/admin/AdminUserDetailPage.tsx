import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchAdminUserProfile, type AdminIncomeHistoryItem, type AdminReferralNode, type AdminUserProfile } from "../../services/adminService";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ReferralNode = ({ node, depth = 0 }: { node: AdminReferralNode; depth?: number }) => (
  <li className="space-y-1">
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm" style={{ marginLeft: depth * 10 }}>
      <p className="font-medium text-cyan-100">
        {node.name} <span className="text-xs text-slate-400">({node.userId})</span>
      </p>
      <p className="text-xs text-slate-300">{node.email}</p>
    </div>
    {node.children.length > 0 && (
      <ul className="space-y-1">
        {node.children.map((child) => (
          <ReferralNode key={child.id} node={child} depth={depth + 1} />
        ))}
      </ul>
    )}
  </li>
);

const AdminUserDetailPage = () => {
  const { id = "" } = useParams();
  const [profile, setProfile] = useState<AdminUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const { data } = await fetchAdminUserProfile(id);
        setProfile(data);
      } catch (e: any) {
        setError(e?.response?.data?.message || "Failed to load user profile");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const incomeItems: AdminIncomeHistoryItem[] = profile?.incomeHistory || [];
  const rootTree: AdminReferralNode[] = profile?.referralTree || [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-cyan-100">User Profile</h2>
          <p className="mt-1 text-sm text-slate-300">Detailed admin profile with referral and income visibility.</p>
        </div>
        <Link to="/admin/users" className="rounded-xl border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
          Back to Users
        </Link>
      </div>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {loading && (
        <p className="rounded-xl border border-cyan-700/25 bg-slate-950/45 px-3 py-3 text-sm text-slate-300">Loading user detail...</p>
      )}

      {!loading && profile && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl border border-cyan-600/30 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">User ID</p>
              <p className="mt-2 text-base font-semibold text-cyan-100">{profile.user.userId}</p>
            </article>
            <article className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Wallet Balance</p>
              <p className="mt-2 text-base font-semibold text-slate-100">{money(profile.wallet?.balance || 0)}</p>
            </article>
            <article className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Trading Balance</p>
              <p className="mt-2 text-base font-semibold text-slate-100">{money(profile.wallet?.tradingBalance || 0)}</p>
            </article>
            <article className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Referral Count</p>
              <p className="mt-2 text-base font-semibold text-slate-100">{profile.user.referralCount || 0}</p>
            </article>
          </div>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">User Information</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <p>
                <span className="text-slate-400">Name:</span> {profile.user.name}
              </p>
              <p>
                <span className="text-slate-400">Email:</span> {profile.user.email}
              </p>
              <p>
                <span className="text-slate-400">Wallet Address:</span> {profile.user.walletAddress || "Not linked"}
              </p>
              <p>
                <span className="text-slate-400">Join Date:</span> {new Date(profile.user.createdAt).toLocaleString()}
              </p>
              <p>
                <span className="text-slate-400">Last Login:</span>{" "}
                {profile.user.lastLoginAt ? new Date(profile.user.lastLoginAt).toLocaleString() : "Never"}
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Balances</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
              <p>
                <span className="text-slate-400">Deposit Wallet:</span> {money(profile.wallet?.depositWallet || 0)}
              </p>
              <p>
                <span className="text-slate-400">Trading Wallet:</span> {money(profile.wallet?.tradingBalance || 0)}
              </p>
              <p>
                <span className="text-slate-400">Withdrawal Wallet:</span> {money(profile.wallet?.withdrawalWallet || 0)}
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Income Breakdown</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
              <p>
                <span className="text-slate-400">Trading:</span> {money(profile.incomeBreakdown.tradingIncome)}
              </p>
              <p>
                <span className="text-slate-400">Referral:</span> {money(profile.incomeBreakdown.referralIncome)}
              </p>
              <p>
                <span className="text-slate-400">Level:</span> {money(profile.incomeBreakdown.levelIncome)}
              </p>
              <p>
                <span className="text-slate-400">Salary:</span> {money(profile.incomeBreakdown.salaryIncome)}
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Referral Tree</h3>
            {rootTree.length === 0 ? (
              <p className="mt-3 text-sm text-slate-300">No referrals in tree.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {rootTree.map((node) => (
                  <ReferralNode key={node.id} node={node} />
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-2xl border border-cyan-700/30 bg-slate-950/55 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Complete Income History</h3>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-700/60">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-950/70 text-left text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Income Type</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                  {incomeItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-slate-300">
                        No income records found.
                      </td>
                    </tr>
                  )}
                  {incomeItems.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 text-cyan-100">{entry.incomeType}</td>
                      <td className="px-3 py-2 text-slate-200">{money(entry.amount)}</td>
                      <td className="px-3 py-2 text-slate-300">{entry.source}</td>
                      <td className="px-3 py-2 text-slate-300">{new Date(entry.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-slate-300">{new Date(entry.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
};

export default AdminUserDetailPage;
