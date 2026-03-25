import { ReactNode, useEffect, useState } from "react";
import { Bell, CheckCheck, Download, Menu, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNavigation from "../components/BottomNavigation";
import CryptivaLogo from "../components/CryptivaLogo";
import { apkDownloadUrl } from "../config/appConfig";
import { useAuth } from "../hooks/useAuth";
import {
  fetchMyNotifications,
  fetchMyUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type UserNotificationItem,
} from "../services/notificationService";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationItems, setNotificationItems] = useState<UserNotificationItem[]>([]);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationPages, setNotificationPages] = useState(1);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const onLogout = () => {
    setMenuOpen(false);
    logout();
    navigate("/login");
  };

  const refreshUnreadCount = async () => {
    try {
      const { data } = await fetchMyUnreadNotificationCount();
      setNotificationUnread(Number(data.unread || 0));
    } catch {
      setNotificationUnread(0);
    }
  };

  const loadNotifications = async (page = 1, append = false) => {
    setNotificationLoading(true);
    try {
      const { data } = await fetchMyNotifications({ page, limit: 12 });
      const nextItems = data.items || [];
      setNotificationItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setNotificationPage(data.pagination?.page || page);
      setNotificationPages(data.pagination?.pages || 1);
    } catch {
      if (!append) {
        setNotificationItems([]);
      }
    } finally {
      setNotificationLoading(false);
    }
  };

  const onOpenNotifications = async () => {
    const willOpen = !notificationOpen;
    setNotificationOpen(willOpen);
    if (willOpen) {
      await loadNotifications(1, false);
      await refreshUnreadCount();
    }
  };

  const onMarkNotificationRead = async (item: UserNotificationItem) => {
    if (item.isRead) return;
    try {
      await markNotificationAsRead(item._id);
      setNotificationItems((prev) =>
        prev.map((entry) =>
          entry._id === item._id ? { ...entry, isRead: true, readAt: new Date().toISOString() } : entry
        )
      );
      setNotificationUnread((prev) => Math.max(0, prev - 1));
    } catch {
      // Keep UI state unchanged if mark-read fails.
    }
  };

  const onMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await markAllNotificationsAsRead();
      setNotificationItems((prev) =>
        prev.map((entry) => ({ ...entry, isRead: true, readAt: entry.readAt || new Date().toISOString() }))
      );
      setNotificationUnread(0);
    } finally {
      setMarkingAllRead(false);
    }
  };

  useEffect(() => {
    refreshUnreadCount();
    const timer = window.setInterval(() => {
      refreshUnreadCount();
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#10284A_0%,#061427_62%)] text-wallet-text">
      <header className="sticky top-0 z-20 border-b border-wallet-border/60 bg-wallet-bg/90 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <CryptivaLogo variant="icon" className="h-8 w-8 shrink-0" />
            <span className="truncate text-lg font-bold tracking-wide text-wallet-text">CRYPTIVA</span>
          </div>
          <div className="relative flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onOpenNotifications}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-wallet-accent/30 bg-wallet-panel text-wallet-text transition hover:border-wallet-accent hover:bg-wallet-panelAlt hover:text-wallet-accent"
              aria-label="Notifications"
            >
              <Bell size={16} />
              {notificationUnread > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-wallet-danger px-1 text-[10px] font-semibold text-white">
                  {notificationUnread > 99 ? "99+" : notificationUnread}
                </span>
              )}
            </button>
            <a
              href={apkDownloadUrl}
              download
              target="_blank"
              rel="noreferrer"
              title="Download App"
              aria-label="Download App"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-wallet-accent/30 bg-wallet-panel text-wallet-text transition hover:border-wallet-accent hover:bg-wallet-panelAlt hover:text-wallet-accent"
            >
              <Download size={16} />
            </a>
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-xl border border-wallet-border/80 bg-wallet-panel p-2 text-wallet-text transition hover:border-wallet-accent/60 hover:bg-wallet-panelAlt hover:text-wallet-accent"
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>

            {notificationOpen && (
              <div className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-[min(24rem,90vw)] rounded-2xl border border-wallet-border/70 bg-wallet-bg/95 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-wallet-accent">Notifications</p>
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    disabled={markingAllRead || notificationItems.length === 0 || notificationUnread === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-wallet-accent/25 bg-wallet-accent/10 px-2 py-1 text-[11px] text-wallet-text hover:bg-wallet-accent/15 disabled:opacity-50"
                  >
                    <CheckCheck size={12} />
                    {markingAllRead ? "Marking..." : "Mark all read"}
                  </button>
                </div>

                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {!notificationLoading && notificationItems.length === 0 && (
                    <p className="rounded-xl border border-wallet-border/50 bg-wallet-panel/70 px-3 py-4 text-center text-xs text-wallet-muted">
                      No notifications yet.
                    </p>
                  )}

                  {notificationItems.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => onMarkNotificationRead(item)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        item.isRead
                          ? "border-wallet-border/40 bg-wallet-panel/70 text-wallet-muted"
                          : "border-wallet-accent/30 bg-wallet-accent/10 text-wallet-text"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <span className="shrink-0 text-[10px] text-wallet-muted">{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed">{item.message}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-wallet-muted">
                        {item.isRead ? "Read" : "Unread"} {"\u2022"} {item.type}
                      </p>
                    </button>
                  ))}
                </div>

                {notificationPage < notificationPages && (
                  <button
                    type="button"
                    disabled={notificationLoading}
                    onClick={() => loadNotifications(notificationPage + 1, true)}
                    className="mt-2 w-full rounded-lg border border-wallet-border/60 bg-wallet-panel/80 px-3 py-2 text-xs text-wallet-text hover:bg-wallet-panelAlt disabled:opacity-50"
                  >
                    {notificationLoading ? "Loading..." : "Load more"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-wallet-bg/75 transition-opacity md:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label="Close mobile menu"
      />

      <aside
        className={`fixed right-0 top-0 z-40 h-screen w-72 border-l border-wallet-border/70 bg-wallet-bg/95 p-4 shadow-2xl backdrop-blur transition-transform duration-300 md:hidden ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CryptivaLogo variant="icon" className="h-6 w-6 shrink-0" />
            <span className="text-sm font-semibold tracking-wide text-wallet-accent">CRYPTIVA</span>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="rounded-lg border border-wallet-border/80 bg-wallet-panel p-1.5 text-wallet-text"
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>
        <nav className="space-y-1">
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-wallet-muted hover:bg-wallet-panelAlt hover:text-wallet-text" to="/deposit">
            Deposit
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-wallet-muted hover:bg-wallet-panelAlt hover:text-wallet-text" to="/withdraw">
            Withdraw
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-wallet-muted hover:bg-wallet-panelAlt hover:text-wallet-text" to="/p2p">
            P2P Transfer
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-wallet-muted hover:bg-wallet-panelAlt hover:text-wallet-text" to="/wallet-transfer">
            Transfer Funds
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-wallet-muted hover:bg-wallet-panelAlt hover:text-wallet-text" to="/support">
            Support / Query
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-wallet-muted hover:bg-wallet-panelAlt hover:text-wallet-text" to="/profile">
            Wallet address
          </Link>
        </nav>
        <button
          onClick={onLogout}
          className="mt-4 w-full rounded-lg px-3 py-2 text-left text-sm text-wallet-danger hover:bg-wallet-danger/10"
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
