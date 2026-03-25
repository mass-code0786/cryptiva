import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { fetchReferralIncomeHistory, fetchTeamReferrals, type ReferralIncomeHistoryItem } from "../services/userService";
import { toLevelStatusRows } from "../utils/levelUnlockStatus";

type TeamItem = {
  _id: string;
  level: number;
  status?: "active" | "inactive";
  investment?: number;
  joinedAt?: string;
  fromUser?: {
    name?: string;
    email?: string;
    userId?: string;
  };
};

const ReferralsPage = () => {
  const [items, setItems] = useState<TeamItem[]>([]);
  const [totalDirectTeam, setTotalDirectTeam] = useState(0);
  const [totalLevelTeam, setTotalLevelTeam] = useState(0);
  const [levelIncomeHistory, setLevelIncomeHistory] = useState<ReferralIncomeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [qualifiedDirectCount, setQualifiedDirectCount] = useState(0);
  const [unlockedLevels, setUnlockedLevels] = useState(0);
  const [maxLevels, setMaxLevels] = useState(30);
  const [levelStatusRows, setLevelStatusRows] = useState<Array<{ level: number; status: "open" | "locked" }>>(
    toLevelStatusRows([], 30) as Array<{ level: number; status: "open" | "locked" }>
  );

  useEffect(() => {
    Promise.all([
      fetchTeamReferrals(),
      fetchReferralIncomeHistory({ incomeType: "level", page: 1, limit: 100 }),
    ])
      .then(([teamRes, historyRes]) => {
        const referrals = teamRes.data.referrals || [];
        setItems(referrals);
        setTotalDirectTeam(Number(teamRes.data.totalDirectTeam || referrals.filter((item) => Number(item.level) === 1).length));
        setTotalLevelTeam(Number(teamRes.data.totalLevelTeam || referrals.length));
        const resolvedMaxLevels = Number(teamRes.data.maxLevels || 30);
        setQualifiedDirectCount(Number(teamRes.data.qualifiedDirectCount || 0));
        setUnlockedLevels(Number(teamRes.data.unlockedLevels || 0));
        setMaxLevels(resolvedMaxLevels);
        setLevelStatusRows(
          toLevelStatusRows(teamRes.data.levelStatus || [], resolvedMaxLevels) as Array<{ level: number; status: "open" | "locked" }>
        );
        setLevelIncomeHistory(historyRes.data.items || []);
      })
      .catch(() => {
        setItems([]);
        setTotalDirectTeam(0);
        setTotalLevelTeam(0);
        setQualifiedDirectCount(0);
        setUnlockedLevels(0);
        setMaxLevels(30);
        setLevelStatusRows(toLevelStatusRows([], 30) as Array<{ level: number; status: "open" | "locked" }>);
        setLevelIncomeHistory([]);
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  const levelMap = useMemo(() => {
    const map = new Map<number, TeamItem[]>();
    for (let i = 1; i <= 30; i += 1) map.set(i, []);
    items.forEach((item) => map.set(item.level, [...(map.get(item.level) || []), item]));
    return map;
  }, [items]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-wallet-muted">Total Direct Team</p>
            <p className="mt-2 text-2xl font-semibold text-wallet-accent">{totalDirectTeam}</p>
          </div>
          <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-wallet-muted">Total Level Team</p>
            <p className="mt-2 text-2xl font-semibold text-wallet-accent">{totalLevelTeam}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
          <h2 className="text-xl font-semibold text-wallet-success">Level Unlock Status</h2>
          <p className="mt-1 text-sm text-wallet-muted">Unlock rule: 1 qualified direct = 2 levels</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt p-3">
              <p className="text-wallet-muted">Qualified Directs</p>
              <p className="mt-1 text-lg font-semibold text-wallet-accent">{qualifiedDirectCount}</p>
            </div>
            <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt p-3">
              <p className="text-wallet-muted">Unlocked Levels</p>
              <p className="mt-1 text-lg font-semibold text-wallet-success">
                {unlockedLevels} / {maxLevels}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
            {levelStatusRows.map((row) => (
              <div
                key={row.level}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  row.status === "open"
                    ? "border-wallet-success/40 bg-wallet-success/10 text-wallet-success"
                    : "border-wallet-border bg-wallet-panelAlt text-wallet-muted"
                }`}
              >
                <p className="font-semibold">Level {row.level}</p>
                <p className="mt-1 uppercase tracking-[0.12em]">{row.status === "open" ? "Open" : "Locked"}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
          <h3 className="text-base font-semibold text-wallet-accent">Level Income History (Audit Trace)</h3>
          <p className="mt-1 text-xs text-wallet-muted">
            Includes level number, source member details, receiver details, ROI/trade reference, and timestamp.
          </p>
          {historyLoading ? (
            <p className="mt-3 text-sm text-wallet-muted">Loading level income history...</p>
          ) : levelIncomeHistory.length === 0 ? (
            <p className="mt-3 text-sm text-wallet-muted">No level income records found.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-wallet-muted">
                    <th className="px-2 py-1">Time</th>
                    <th className="px-2 py-1">Level</th>
                    <th className="px-2 py-1">Amount</th>
                    <th className="px-2 py-1">Receiver ID</th>
                    <th className="px-2 py-1">Source User ID</th>
                    <th className="px-2 py-1">Source Name</th>
                    <th className="px-2 py-1">Source Sponsor ID</th>
                    <th className="px-2 py-1">Trade Ref</th>
                    <th className="px-2 py-1">ROI Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {levelIncomeHistory.map((row) => (
                    <tr key={row.id} className="border-t border-wallet-border/50">
                      <td className="px-2 py-2 text-wallet-muted">{row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}</td>
                      <td className="px-2 py-2 text-wallet-accent">L{row.level || "-"}</td>
                      <td className="px-2 py-2 text-wallet-text">${Number(row.amount || 0).toFixed(4)}</td>
                      <td className="px-2 py-2 text-wallet-muted">{row.receiverUserId || "-"}</td>
                      <td className="px-2 py-2 text-wallet-muted">{row.sourceUserId || "-"}</td>
                      <td className="px-2 py-2 text-wallet-muted">{row.sourceUserName || "-"}</td>
                      <td className="px-2 py-2 text-wallet-muted">{row.sourceUserSponsorId || "-"}</td>
                      <td className="px-2 py-2 text-wallet-muted">{row.tradeId || "-"}</td>
                      <td className="px-2 py-2 text-wallet-muted">{row.roiEventKey || row.roiCreditTransactionId || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
              <p className="text-sm text-wallet-muted">No team members yet.</p>
            </div>
          )}
          {Array.from(levelMap.entries()).map(([level, members]) => (
            <div key={level} className="rounded-2xl border border-wallet-border bg-wallet-panel p-4">
              <h3 className="text-sm font-semibold text-wallet-accent">Level {level}</h3>
              {members.length === 0 ? (
                <p className="mt-2 text-xs text-wallet-muted">No members in this level.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-wallet-muted">
                        <th className="px-2 py-1">User ID</th>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Join Date</th>
                        <th className="px-2 py-1">Investment</th>
                        <th className="px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member._id} className="border-t border-wallet-border/50">
                          <td className="px-2 py-2 text-wallet-accent">{member.fromUser?.userId || "-"}</td>
                          <td className="px-2 py-2 text-wallet-text">{member.fromUser?.name || "User"}</td>
                          <td className="px-2 py-2 text-wallet-muted">
                            {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-2 py-2 text-wallet-muted">${Number(member.investment || 0).toFixed(2)}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`rounded-full px-2 py-1 uppercase ${
                                member.status === "active"
                                  ? "bg-wallet-success/20 text-wallet-success"
                                  : "bg-wallet-panelAlt text-wallet-muted"
                              }`}
                            >
                              {member.status || "inactive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ReferralsPage;
