import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { createSupportQuery, fetchMySupportQueries, type SupportQueryItem } from "../services/supportService";

const SupportPage = () => {
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [items, setItems] = useState<SupportQueryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchMySupportQueries();
      setItems(data.items || []);
    } catch {
      setItems([]);
      setError("Failed to load query history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!subject.trim() || !messageText.trim()) {
      setError("Subject and message are required");
      return;
    }

    setSubmitting(true);
    try {
      await createSupportQuery({ subject: subject.trim(), message: messageText.trim() });
      setMessage("Query sent successfully");
      setSubject("");
      setMessageText("");
      await load();
    } catch {
      setError("Failed to send query");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <section className="space-y-4">
        <div>
          <h2 className="wallet-title text-xl">Support / Query</h2>
          <p className="mt-1 text-sm text-wallet-muted">Submit your query and track admin replies.</p>
        </div>

        <form onSubmit={onSubmit} className="wallet-panel space-y-3 p-4">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            className="wallet-input"
          />
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            rows={4}
            placeholder="Message"
            className="wallet-input"
          />
          <button
            type="submit"
            disabled={submitting}
            className="wallet-button-primary disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Send Query"}
          </button>
        </form>

        {message && <p className="rounded-xl border border-wallet-accent/25 bg-wallet-accent/10 px-3 py-2 text-sm text-wallet-accent">{message}</p>}
        {error && <p className="rounded-xl border border-wallet-danger/30 bg-wallet-danger/10 px-3 py-2 text-sm text-wallet-danger">{error}</p>}

        <div className="wallet-table">
          <table className="min-w-full divide-y divide-cyan-800/30 text-sm">
            <thead className="bg-wallet-panelAlt/90 text-left text-wallet-muted">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Admin Reply</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8 bg-wallet-panel/60">
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-wallet-muted">
                    No queries found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-wallet-muted">
                    Loading queries...
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => (
                  <tr key={item._id}>
                    <td className="px-4 py-3 text-wallet-accentAlt">{item.subject}</td>
                    <td className="px-4 py-3 text-wallet-muted">{item.message}</td>
                    <td className="px-4 py-3 text-wallet-muted">{item.adminReply || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="wallet-chip wallet-status-info">{item.status}</span>
                    </td>
                    <td className="px-4 py-3 text-wallet-muted">{new Date(item.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  );
};

export default SupportPage;
