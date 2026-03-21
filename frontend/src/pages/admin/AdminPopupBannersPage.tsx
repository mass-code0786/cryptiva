import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createAdminPopupBanner,
  deleteAdminPopupBanner,
  fetchAdminPopupBanners,
  updateAdminPopupBannerStatus,
  type PopupBannerItem,
} from "../../services/popupBannerService";

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });

const AdminPopupBannersPage = () => {
  const [title, setTitle] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<PopupBannerItem[]>([]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchAdminPopupBanners({ page: 1, limit: 25 });
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load popup banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback("");
    setError("");
    if (!file) {
      setError("Banner image is required");
      return;
    }

    setSubmitting(true);
    try {
      const imageBase64 = await fileToBase64(file);
      await createAdminPopupBanner({
        title: title.trim(),
        targetUrl: targetUrl.trim(),
        imageBase64,
        fileName: file.name,
        isActive,
        sortOrder: Number(sortOrder) || 0,
      });
      setFeedback("Popup banner created");
      setTitle("");
      setTargetUrl("");
      setIsActive(true);
      setSortOrder("0");
      setFile(null);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to create popup banner");
    } finally {
      setSubmitting(false);
    }
  };

  const onToggleStatus = async (item: PopupBannerItem) => {
    setError("");
    try {
      await updateAdminPopupBannerStatus(item._id, !item.isActive);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to update banner status");
    }
  };

  const onDelete = async (item: PopupBannerItem) => {
    if (!window.confirm("Delete this popup banner?")) return;
    setError("");
    try {
      await deleteAdminPopupBanner(item._id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to delete banner");
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-cyan-100">Popup Banners</h2>
        <p className="mt-1 text-sm text-slate-300">Upload and manage dashboard popup banners shown to users.</p>
      </div>

      {feedback && <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{feedback}</p>}
      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-cyan-700/30 bg-slate-950/45 p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title (optional)"
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <input
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="Target URL (optional)"
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            placeholder="Sort order"
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            Set active now
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
          />
        </div>

        {previewUrl && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-2">
            <img src={previewUrl} alt="Banner preview" className="max-h-56 w-full rounded-lg object-contain" />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
        >
          {submitting ? "Uploading..." : "Create Popup Banner"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-cyan-700/25">
        <table className="min-w-[880px] divide-y divide-cyan-800/30 text-sm">
          <thead className="bg-slate-950/70 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Preview</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Target URL</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-300">
                  No popup banners yet.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-300">
                  Loading banners...
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => (
                <tr key={item._id}>
                  <td className="px-4 py-3">
                    <img src={item.imageUrl} alt={item.title || "Popup banner"} className="h-16 w-28 rounded-md object-cover" />
                  </td>
                  <td className="px-4 py-3 text-cyan-100">{item.title || "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{item.targetUrl || "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{item.isActive ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3 text-slate-300">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleStatus(item)}
                        className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
                      >
                        {item.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminPopupBannersPage;
