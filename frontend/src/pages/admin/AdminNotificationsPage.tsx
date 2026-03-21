import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  fetchAdminNotificationBroadcasts,
  fetchAdminUsers,
  sendAdminNotificationBroadcast,
  type AdminNotificationAudienceType,
  type AdminNotificationBroadcastItem,
  type AdminNotificationType,
  type AdminPagination,
  type AdminUserItem,
} from "../../services/adminService";

const buildIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const AdminNotificationsPage = () => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<AdminNotificationType>("announcement");
  const [audienceType, setAudienceType] = useState<AdminNotificationAudienceType>("all");
  const [idempotencyKey, setIdempotencyKey] = useState(buildIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const [userSearch, setUserSearch] = useState("");
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userResults, setUserResults] = useState<AdminUserItem[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<AdminUserItem[]>([]);

  const [broadcasts, setBroadcasts] = useState<AdminNotificationBroadcastItem[]>([]);
  const [pagination, setPagination] = useState<AdminPagination>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);
  const [recipientEstimate, setRecipientEstimate] = useState(0);
  const [estimatingRecipients, setEstimatingRecipients] = useState(false);

  const selectedUserIds = useMemo(() => selectedUsers.map((item) => item.id), [selectedUsers]);
  const canSend =
    !submitting &&
    Boolean(title.trim()) &&
    Boolean(message.trim()) &&
    (audienceType !== "selected" || selectedUserIds.length > 0);

  const loadBroadcasts = async (page = 1) => {
    setLoadingBroadcasts(true);
    try {
      const { data } = await fetchAdminNotificationBroadcasts({ page, limit: pagination.limit });
      setBroadcasts(data.items || []);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load notification broadcasts");
    } finally {
      setLoadingBroadcasts(false);
    }
  };

  useEffect(() => {
    loadBroadcasts(1);
  }, []);

  useEffect(() => {
    const estimateRecipients = async () => {
      if (audienceType === "selected") {
        setRecipientEstimate(selectedUserIds.length);
        return;
      }

      setEstimatingRecipients(true);
      try {
        const status = audienceType === "all" ? "all" : audienceType;
        const { data } = await fetchAdminUsers({ status, page: 1, limit: 1 });
        setRecipientEstimate(Number(data?.pagination?.total || 0));
      } catch {
        setRecipientEstimate(0);
      } finally {
        setEstimatingRecipients(false);
      }
    };

    estimateRecipients();
  }, [audienceType, selectedUserIds.length]);

  const searchUsers = async () => {
    const query = userSearch.trim();
    if (!query) {
      setUserResults([]);
      return;
    }

    setUserSearchLoading(true);
    try {
      const { data } = await fetchAdminUsers({ search: query, page: 1, limit: 10, status: "all" });
      setUserResults(data.items || []);
    } catch {
      setUserResults([]);
      setError("Failed to search users");
    } finally {
      setUserSearchLoading(false);
    }
  };

  const addSelectedUser = (item: AdminUserItem) => {
    setSelectedUsers((prev) => (prev.some((entry) => entry.id === item.id) ? prev : [...prev, item]));
  };

  const removeSelectedUser = (id: string) => {
    setSelectedUsers((prev) => prev.filter((entry) => entry.id !== id));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback("");
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!message.trim()) {
      setError("Message is required");
      return;
    }
    if (audienceType === "selected" && selectedUserIds.length === 0) {
      setError("Select at least one user for selected audience");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await sendAdminNotificationBroadcast({
        title: title.trim(),
        message: message.trim(),
        type,
        audienceType,
        selectedUserIds: audienceType === "selected" ? selectedUserIds : [],
        idempotencyKey,
      });
      setFeedback(`${data.message}. Delivered: ${data.broadcast?.deliveredCount || data.insertedCount}`);
      setIdempotencyKey(buildIdempotencyKey());
      setTitle("");
      setMessage("");
      setSelectedUsers([]);
      setUserResults([]);
      setUserSearch("");
      await loadBroadcasts(1);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to send notification");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Notifications</h2>
        <p className="mt-1 text-sm text-slate-300">Send announcements to all users, selected users, active users, or inactive users.</p>
      </div>

      {feedback && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{feedback}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-cyan-700/30 bg-slate-950/45 p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Notification title"
            maxLength={140}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 md:col-span-2"
          />
          <select
            value={type}
            onChange={(event) => setType(event.target.value as AdminNotificationType)}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="announcement">Announcement</option>
            <option value="system">System</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Notification message"
          rows={4}
          maxLength={4000}
          className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
        />

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <select
            value={audienceType}
            onChange={(event) => setAudienceType(event.target.value as AdminNotificationAudienceType)}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="all">All Users</option>
            <option value="selected">Selected Users</option>
            <option value="active">All Active Users</option>
            <option value="inactive">All Inactive Users</option>
          </select>
          <input
            value={idempotencyKey}
            onChange={(event) => setIdempotencyKey(event.target.value)}
            placeholder="Retry key (idempotency)"
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 md:col-span-2"
          />
        </div>

        {audienceType === "selected" && (
          <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search users by name/email/userId"
                className="min-w-[220px] flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={searchUsers}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20"
              >
                {userSearchLoading ? "Searching..." : "Search Users"}
              </button>
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => removeSelectedUser(user.id)}
                    className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                    title="Remove user"
                  >
                    {user.userId} ({user.name}) x
                  </button>
                ))}
              </div>
            )}

            {userResults.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/60">
                {userResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs last:border-b-0">
                    <p className="text-slate-200">
                      {user.userId} - {user.name} ({user.email})
                    </p>
                    <button
                      type="button"
                      onClick={() => addSelectedUser(user)}
                      className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-100 hover:bg-cyan-500/20"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-cyan-700/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          Estimated recipients:{" "}
          {estimatingRecipients ? "Calculating..." : recipientEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>

        <button
          type="submit"
          disabled={!canSend}
          className="w-full rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Send Notification"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-[1040px] divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Audience</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Delivered</th>
              <th className="px-4 py-3">Sender</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loadingBroadcasts && broadcasts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-300">
                  No notification broadcasts yet.
                </td>
              </tr>
            )}
            {loadingBroadcasts && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-slate-300">
                  Loading broadcasts...
                </td>
              </tr>
            )}
            {!loadingBroadcasts &&
              broadcasts.map((item) => (
                <tr key={item._id}>
                  <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-cyan-100">{item.title}</td>
                  <td className="px-4 py-3 text-slate-300">{item.audienceType}</td>
                  <td className="px-4 py-3 text-slate-300">{item.type}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {item.deliveredCount}/{item.recipientCount}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.senderId?.userId || item.senderId?.name || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminNotificationsPage;
