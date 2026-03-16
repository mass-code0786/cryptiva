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
          <h2 className="text-xl font-semibold text-cyan-100">Support / Query</h2>
          <p className="mt-1 text-sm text-slate-400">Submit your query and track admin replies.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            rows={4}
            placeholder="Message"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Send Query"}
          </button>
        </form>

        {message && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{message}</p>}
        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
          <table className="min-w-full divide-y divide-cyan-800/30 text-sm">
            <thead className="bg-slate-950/70 text-left text-slate-300">
              <tr>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Admin Reply</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/60">
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-slate-300">
                    No queries found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-slate-300">
                    Loading queries...
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => (
                  <tr key={item._id}>
                    <td className="px-4 py-3 text-cyan-100">{item.subject}</td>
                    <td className="px-4 py-3 text-slate-300">{item.message}</td>
                    <td className="px-4 py-3 text-slate-300">{item.adminReply || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-xs uppercase tracking-wide text-cyan-100">{item.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleString()}</td>
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
