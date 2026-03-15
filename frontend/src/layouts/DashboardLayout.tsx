import { ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BottomNavigation from "../components/BottomNavigation";
import CryptivaLogo from "../components/CryptivaLogo";
import { useAuth } from "../hooks/useAuth";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#020617_60%)] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-cyan-900/40 bg-slate-950/85 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <CryptivaLogo variant="icon" className="h-8 w-8 shrink-0" />
            <span className="truncate text-lg font-bold tracking-wide text-slate-100">CRYPTIVA</span>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-xl border border-cyan-800/60 bg-slate-900 px-3 py-2 text-sm leading-none"
            >
              ...
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 w-44 rounded-xl border border-cyan-800/60 bg-slate-900 p-2 shadow-2xl">
                <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/deposit">
                  Deposit
                </Link>
                <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/withdraw">
                  Withdraw
                </Link>
                <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/p2p">
                  P2P Transfer
                </Link>
                <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/wallet-transfer">
                  Transfer Funds
                </Link>
                <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/profile">
                  Wallet address
                </Link>
                <button
                  onClick={onLogout}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-5">{children}</main>
      <BottomNavigation />
    </div>
  );
};

export default DashboardLayout;
