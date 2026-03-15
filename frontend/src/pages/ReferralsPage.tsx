import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { fetchTeamReferrals } from "../services/userService";

type TeamItem = {
  _id: string;
  level: number;
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
    const map = new Map<number, number>();
    for (let i = 1; i <= 30; i += 1) map.set(i, 0);
    items.forEach((item) => map.set(item.level, (map.get(item.level) || 0) + 1));
    return map;
  }, [items]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h2 className="text-xl font-semibold">Team - 30 Level View</h2>
          <p className="mt-1 text-sm text-slate-400">Referral count in each level.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {Array.from(levelMap.entries()).map(([level, count]) => (
              <div key={level} className="rounded-xl bg-slate-800/60 p-2">
                <p className="text-slate-400">L{level}</p>
                <p className="font-semibold text-cyan-300">{count}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h3 className="text-sm font-semibold text-cyan-200">Team Members</h3>
          <div className="mt-3 space-y-2">
            {items.length === 0 && <p className="text-sm text-slate-400">No team members yet.</p>}
            {items.map((item) => (
              <div key={item._id} className="rounded-xl bg-slate-800/60 p-3">
                <p className="text-sm font-semibold">{item.fromUser?.name || "User"}</p>
                <p className="text-xs text-slate-400">{item.fromUser?.email || "-"}</p>
                <p className="mt-1 text-xs text-cyan-300">Level {item.level}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ReferralsPage;
