import { ReactNode, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNavigation from "../components/BottomNavigation";
import CryptivaLogo from "../components/CryptivaLogo";
import { useAuth } from "../hooks/useAuth";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = () => {
    setMenuOpen(false);
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
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border border-cyan-800/60 bg-slate-900 p-2 text-cyan-100 transition hover:border-cyan-600 hover:bg-slate-800"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-slate-950/70 transition-opacity md:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label="Close mobile menu"
      />

      <aside
        className={`fixed right-0 top-0 z-40 h-screen w-72 border-l border-cyan-800/50 bg-slate-950/95 p-4 shadow-2xl backdrop-blur transition-transform duration-300 md:hidden ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CryptivaLogo variant="icon" className="h-6 w-6 shrink-0" />
            <span className="text-sm font-semibold tracking-wide text-cyan-100">CRYPTIVA</span>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="rounded-lg border border-cyan-800/60 bg-slate-900 p-1.5 text-cyan-100"
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>
        <nav className="space-y-1">
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
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/support">
            Support / Query
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-800" to="/profile">
            Wallet address
          </Link>
        </nav>
        <button
          onClick={onLogout}
          className="mt-4 w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40"
        >
          Logout
        </button>
      </aside>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-5">{children}</main>
      <BottomNavigation />
    </div>
  );
};

export default DashboardLayout;
