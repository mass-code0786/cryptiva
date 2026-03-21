import { Activity, Bell, GitBranch, LayoutDashboard, LifeBuoy, LogOut, Menu, ScrollText, TrendingUp, Users, WalletCards, WalletMinimal, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/deposits", label: "Deposits", icon: WalletCards },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: WalletCards },
  { to: "/admin/trading-control", label: "Trading Control", icon: TrendingUp },
  { to: "/admin/fund-management", label: "Fund Management", icon: WalletMinimal },
  { to: "/admin/income-history", label: "Income History", icon: ScrollText },
  { to: "/admin/referral-tree", label: "Referral Tree", icon: GitBranch },
  { to: "/admin/support-queries", label: "Support Queries", icon: LifeBuoy },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/activity-logs", label: "Activity Logs", icon: Activity },
];

const AdminLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const onLogout = () => {
    setIsSidebarOpen(false);
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_10%,rgba(8,145,178,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(6,182,212,0.15),transparent_34%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-4 lg:py-6">
        <header className="mb-4 flex items-center justify-between rounded-2xl border border-cyan-700/30 bg-slate-950/70 px-4 py-3 shadow-[0_20px_45px_rgba(2,132,199,0.12)] lg:hidden">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Cryptiva Logo" className="h-6 w-auto shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/80">Cryptiva</p>
              <h1 className="text-sm font-semibold text-cyan-100">Admin Panel</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="rounded-xl border border-cyan-700/40 bg-slate-900/80 p-2 text-cyan-100"
            aria-label="Toggle admin menu"
          >
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className={`fixed inset-0 z-30 bg-slate-950/70 transition-opacity lg:hidden ${
              isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-label="Close admin menu"
          />

          <aside
            className={`fixed left-0 top-0 z-40 h-screen w-72 shrink-0 border-r border-cyan-700/30 bg-slate-950 p-4 shadow-[0_24px_70px_rgba(2,132,199,0.15)] transition-transform duration-300 lg:sticky lg:top-5 lg:h-auto lg:translate-x-0 lg:rounded-2xl lg:border lg:bg-slate-950/70 ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="mb-3 flex items-start justify-between lg:mb-0 lg:block">
              <div className="flex items-center gap-2.5 lg:block">
                <img src="/logo.svg" alt="Cryptiva Logo" className="h-6 w-auto shrink-0 lg:h-8" />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80 lg:mt-2">Cryptiva</p>
                  <h1 className="text-xl font-semibold text-cyan-100">Admin Panel</h1>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-lg border border-cyan-700/40 bg-slate-900/80 p-1.5 text-cyan-100 lg:hidden"
                aria-label="Close sidebar"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="mt-5 space-y-2">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setIsSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                      isActive
                        ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40"
                        : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                    }`
                  }
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={onLogout}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
            >
              <LogOut size={15} />
              Logout
            </button>
          </aside>

          <main className="min-w-0 flex-1 rounded-2xl border border-cyan-700/20 bg-slate-900/55 p-4 shadow-[0_24px_70px_rgba(6,182,212,0.1)] md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
