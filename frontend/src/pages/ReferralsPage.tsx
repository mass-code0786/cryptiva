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
          <div className="wallet-panel-muted p-4">
            <p className="wallet-kicker">Total Direct Team</p>
            <p className="mt-2 text-2xl font-semibold text-wallet-accentSoft">{totalDirectTeam}</p>
          </div>
          <div className="wallet-panel-muted p-4">
            <p className="wallet-kicker">Total Level Team</p>
            <p className="mt-2 text-2xl font-semibold text-wallet-accentSoft">{totalLevelTeam}</p>
          </div>
        </div>
        <div className="wallet-panel p-4">
          <h2 className="wallet-title text-xl">Level Unlock Status</h2>
          <p className="mt-1 text-sm text-wallet-muted">Unlock rule: 1 qualified direct = 2 levels</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-[20px] border border-white/10 bg-[#0a1b34]/85 p-3">
              <p className="text-wallet-muted">Qualified Directs</p>
              <p className="mt-1 text-lg font-semibold text-wallet-accentSoft">{qualifiedDirectCount}</p>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-[#0a1b34]/85 p-3">
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
                    ? "wallet-status-success"
                    : "border-white/10 bg-[#0a1b34]/70 text-wallet-muted"
                }`}
              >
                <p className="font-semibold">Level {row.level}</p>
                <p className="mt-1 uppercase tracking-[0.12em]">{row.status === "open" ? "Open" : "Locked"}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="wallet-panel p-4">
          <h3 className="wallet-title text-base">Level Income History (Audit Trace)</h3>
          <p className="mt-1 text-xs text-wallet-muted">
            Includes level number, source member details, receiver details, ROI/trade reference, and timestamp.
          </p>
          {historyLoading ? (
            <p className="wallet-empty-state mt-3">Loading level income history...</p>
          ) : levelIncomeHistory.length === 0 ? (
            <p className="wallet-empty-state mt-3">No level income records found.</p>
          ) : (
            <div className="wallet-table mt-3">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-[#0c223e]/90 text-left text-wallet-muted">
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
                    <tr key={row.id} className="border-t border-white/8">
                      <td className="px-2 py-2 text-wallet-muted">{row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}</td>
                      <td className="px-2 py-2 text-wallet-accentSoft">L{row.level || "-"}</td>
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
            <div className="wallet-panel p-4">
              <p className="wallet-empty-state">No team members yet.</p>
            </div>
          )}
          {Array.from(levelMap.entries()).map(([level, members]) => (
            <div key={level} className="wallet-panel p-4">
              <h3 className="wallet-title text-sm">Level {level}</h3>
              {members.length === 0 ? (
                <p className="mt-2 text-xs text-wallet-muted">No members in this level.</p>
              ) : (
                <div className="wallet-table mt-3">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-[#0c223e]/90 text-left text-wallet-muted">
                        <th className="px-2 py-1">User ID</th>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Join Date</th>
                        <th className="px-2 py-1">Investment</th>
                        <th className="px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member._id} className="border-t border-white/8">
                          <td className="px-2 py-2 text-wallet-accentSoft">{member.fromUser?.userId || "-"}</td>
                          <td className="px-2 py-2 text-wallet-text">{member.fromUser?.name || "User"}</td>
                          <td className="px-2 py-2 text-wallet-muted">
                            {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-2 py-2 text-wallet-muted">${Number(member.investment || 0).toFixed(2)}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`wallet-chip ${
                                member.status === "active" ? "wallet-status-success" : "wallet-status-warning"
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
