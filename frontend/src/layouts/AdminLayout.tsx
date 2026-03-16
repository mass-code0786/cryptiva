import { LayoutDashboard, LogOut, TrendingUp, Users, Wallet, WalletCards } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/deposits", label: "Deposits", icon: Wallet },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: WalletCards },
  { to: "/admin/trades", label: "Trades", icon: TrendingUp },
];

const AdminLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_10%,rgba(8,145,178,0.28),transparent_36%),radial-gradient(circle_at_85%_0%,rgba(6,182,212,0.15),transparent_34%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <aside className="w-full shrink-0 rounded-2xl border border-cyan-700/30 bg-slate-950/70 p-4 shadow-[0_24px_70px_rgba(2,132,199,0.15)] lg:sticky lg:top-5 lg:w-72 lg:self-start">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Cryptiva</p>
          <h1 className="mt-2 text-xl font-semibold text-cyan-100">Admin Panel</h1>
          <nav className="mt-5 space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
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
  );
};

export default AdminLayout;
