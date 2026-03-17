const DEFAULT_INTERVAL_MS = 300000;
let keepAliveTimer = null;

const normalizeUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const resolveHealthUrl = ({ keepAliveBaseUrl, port }) => {
  const base =
    normalizeUrl(keepAliveBaseUrl) ||
    normalizeUrl(process.env.KEEP_ALIVE_BASE_URL) ||
    normalizeUrl(process.env.RENDER_EXTERNAL_URL) ||
    normalizeUrl(process.env.CLIENT_URL) ||
    `http://127.0.0.1:${port}`;

  return `${base}/api/health`;
};

export const startKeepAliveScheduler = ({ port, intervalMs = DEFAULT_INTERVAL_MS, keepAliveBaseUrl = "" } = {}) => {
  if (keepAliveTimer) {
    return;
  }

  const effectiveInterval = Number(intervalMs) > 0 ? Number(intervalMs) : DEFAULT_INTERVAL_MS;
  const healthUrl = resolveHealthUrl({ keepAliveBaseUrl, port });

  const ping = async () => {
    try {
      const response = await fetch(healthUrl);
      if (!response.ok) {
        console.warn(`[KeepAlive] Ping failed with status ${response.status} for ${healthUrl}`);
      }
    } catch (error) {
      console.warn(`[KeepAlive] Ping failed for ${healthUrl}: ${error.message}`);
    }
  };

  keepAliveTimer = setInterval(() => {
    ping().catch(() => {});
  }, effectiveInterval);

  ping().catch(() => {});
  console.log(`[KeepAlive] Scheduler started. Interval=${effectiveInterval}ms, URL=${healthUrl}`);
};

export const stopKeepAliveScheduler = () => {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    console.log("[KeepAlive] Scheduler stopped.");
  }
};
