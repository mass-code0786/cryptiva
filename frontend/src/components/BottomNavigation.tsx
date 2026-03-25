import { History, LayoutDashboard, TrendingUp, User, Users } from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/trading", label: "Trading", icon: TrendingUp },
  { to: "/team", label: "Team", icon: Users },
  { to: "/history", label: "History", icon: History },
  { to: "/profile", label: "Profile", icon: User },
];

const BottomNavigation = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-wallet-border bg-[#08152a]/96 px-3 py-2 backdrop-blur sm:px-4">
      <div className="mx-auto grid max-w-3xl grid-cols-5 items-center gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[11px] transition-all ${
                  isActive
                    ? "border border-wallet-accent/25 bg-wallet-accent/12 text-wallet-accentSoft shadow-[0_12px_24px_rgba(0,194,255,0.08)]"
                    : "text-wallet-muted hover:bg-white/5 hover:text-wallet-text"
                }`
              }
            >
              <Icon className="mb-1 h-5 w-5 shrink-0" />
              <span className="leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;

