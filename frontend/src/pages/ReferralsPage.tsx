import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { fetchTeamReferrals } from "../services/userService";

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

  useEffect(() => {
    fetchTeamReferrals()
      .then((res) => setItems(res.data.referrals || []))
      .catch(() => setItems([]));
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
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h2 className="text-xl font-semibold">Team - 30 Level View</h2>
          <p className="mt-1 text-sm text-slate-400">Active members are counted when total active/completed trade amount is at least $5.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">
            {Array.from(levelMap.entries()).map(([level, members]) => (
              <div key={level} className="rounded-xl bg-slate-800/60 p-2">
                <p className="text-slate-400">L{level}</p>
                <p className="font-semibold text-cyan-300">{members.filter((entry) => entry.status === "active").length}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
              <p className="text-sm text-slate-400">No team members yet.</p>
            </div>
          )}
          {Array.from(levelMap.entries()).map(([level, members]) => (
            <div key={level} className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
              <h3 className="text-sm font-semibold text-cyan-200">Level {level}</h3>
              {members.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No members in this level.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="px-2 py-1">User ID</th>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Join Date</th>
                        <th className="px-2 py-1">Investment</th>
                        <th className="px-2 py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member._id} className="border-t border-slate-800">
                          <td className="px-2 py-2 text-cyan-300">{member.fromUser?.userId || "-"}</td>
                          <td className="px-2 py-2 text-slate-200">{member.fromUser?.name || "User"}</td>
                          <td className="px-2 py-2 text-slate-400">
                            {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-2 py-2 text-slate-300">${Number(member.investment || 0).toFixed(2)}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`rounded-full px-2 py-1 uppercase ${
                                member.status === "active" ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-700 text-slate-300"
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
