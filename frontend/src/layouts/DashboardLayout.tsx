import { ReactNode, useEffect, useState } from "react";
import { Bell, CheckCheck, Download, Menu, MoonStar, SunMedium, X } from "lucide-react";
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

const themeStorageKey = "cryptiva-theme";
type ThemeMode = "dark" | "light";

const resolveInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme);
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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.add("theme-transition");
    window.localStorage.setItem(themeStorageKey, theme);
    const timer = window.setTimeout(() => root.classList.remove("theme-transition"), 220);
    return () => window.clearTimeout(timer);
  }, [theme]);

  return (
    <div className="wallet-shell">
      <header className="wallet-topbar sticky top-0 z-20 px-3 py-3 sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <CryptivaLogo variant="icon" className="h-8 w-8 shrink-0" />
            <span className="truncate text-lg font-bold tracking-wide text-wallet-text">CRYPTIVA</span>
          </div>
          <div className="relative flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="wallet-theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <SunMedium size={16} /> : <MoonStar size={16} />}
              <span className="hidden sm:inline">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <button
              type="button"
              onClick={onOpenNotifications}
              className="wallet-icon-button relative"
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
              className="wallet-icon-button"
            >
              <Download size={16} />
            </a>
            <button
              onClick={() => setMenuOpen(true)}
              className="wallet-icon-button"
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>

            {notificationOpen && (
              <div className="wallet-panel absolute right-0 top-[calc(100%+0.45rem)] z-30 w-[min(24rem,90vw)] p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-wallet-accent">Notifications</p>
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    disabled={markingAllRead || notificationItems.length === 0 || notificationUnread === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-wallet-accent/25 bg-wallet-accent/10 px-2 py-1 text-[11px] text-wallet-text transition hover:bg-wallet-accent/15 disabled:opacity-50"
                  >
                    <CheckCheck size={12} />
                    {markingAllRead ? "Marking..." : "Mark all read"}
                  </button>
                </div>

                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {!notificationLoading && notificationItems.length === 0 && (
                    <p className="wallet-empty-state px-3 py-4 text-xs">
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
                          ? "border-wallet-border bg-wallet-panel/55 text-wallet-muted"
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
                    className="wallet-button-secondary mt-2 w-full px-3 py-2 text-xs disabled:opacity-50"
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
        className={`fixed right-0 top-0 z-40 h-screen w-72 border-l border-wallet-border bg-wallet-bg/75 p-4 shadow-2xl backdrop-blur-xl transition-transform duration-300 md:hidden ${
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
            className="wallet-icon-button h-8 w-8 rounded-lg p-1.5"
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>
        <nav className="space-y-1">
          <Link onClick={() => setMenuOpen(false)} className="wallet-nav-link" to="/deposit">
            Deposit
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="wallet-nav-link" to="/withdraw">
            Withdraw
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="wallet-nav-link" to="/p2p">
            P2P Transfer
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="wallet-nav-link" to="/wallet-transfer">
            Transfer Funds
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="wallet-nav-link" to="/support">
            Support / Query
          </Link>
          <Link onClick={() => setMenuOpen(false)} className="wallet-nav-link" to="/profile">
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
