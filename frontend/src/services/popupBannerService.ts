import api from "./api";

export type PopupBannerItem = {
  _id: string;
  title?: string;
  imageUrl: string;
  targetUrl?: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    _id?: string;
    userId?: string;
    name?: string;
    email?: string;
  } | null;
};

export const fetchActivePopupBanner = () => api.get<{ item: PopupBannerItem | null }>("/popup-banners/active");

export const createAdminPopupBanner = (payload: {
  title?: string;
  targetUrl?: string;
  imageBase64: string;
  fileName?: string;
  isActive?: boolean;
  sortOrder?: number;
}) => api.post<{ message: string; item: PopupBannerItem }>("/admin/popup-banners", payload);

export const fetchAdminPopupBanners = (params?: { page?: number; limit?: number }) =>
  api.get<{ items: PopupBannerItem[]; pagination: { page: number; limit: number; total: number; pages: number } }>("/admin/popup-banners", {
    params,
  });

export const updateAdminPopupBannerStatus = (bannerId: string, isActive: boolean) =>
  api.patch<{ message: string; item: PopupBannerItem }>(`/admin/popup-banners/${bannerId}/status`, { isActive });

export const deleteAdminPopupBanner = (bannerId: string) =>
  api.delete<{ message: string }>(`/admin/popup-banners/${bannerId}`);

const parseFileNameFromDisposition = (value = "") => {
  const match = String(value || "").match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

export const downloadPopupBannerImage = async (banner: PopupBannerItem) => {
  const response = await api.get<Blob>(`/popup-banners/${banner._id}/download`, {
    responseType: "blob",
  });
  const blob = response.data;
  const objectUrl = window.URL.createObjectURL(blob);
  const suggestedName =
    parseFileNameFromDisposition(String(response.headers?.["content-disposition"] || "")) ||
    `${String(banner.title || "cryptiva-banner").replace(/[^a-z0-9]+/gi, "-") || "cryptiva-banner"}.jpg`;

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};
