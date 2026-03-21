import api from "./api";

export type NotificationAudienceType = "all" | "selected" | "active" | "inactive";
export type NotificationType = "announcement" | "system" | "admin";

export type UserNotificationItem = {
  _id: string;
  userId: string;
  broadcastId: string;
  title: string;
  message: string;
  type: NotificationType;
  audienceType: NotificationAudienceType;
  senderRole: string;
  senderId: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type NotificationBroadcastItem = {
  _id: string;
  title: string;
  message: string;
  type: NotificationType;
  audienceType: NotificationAudienceType;
  senderRole: string;
  senderId?: {
    _id?: string;
    userId?: string;
    name?: string;
    email?: string;
  };
  idempotencyKey?: string;
  recipientCount: number;
  deliveredCount: number;
  status: "processing" | "completed" | "failed";
  failureReason?: string;
  createdAt: string;
  completedAt?: string | null;
};

export const fetchMyNotifications = (params?: { page?: number; limit?: number; unreadOnly?: boolean }) =>
  api.get<{ items: UserNotificationItem[]; pagination: NotificationPagination }>("/notifications", { params });

export const fetchMyUnreadNotificationCount = () => api.get<{ unread: number }>("/notifications/unread-count");

export const markNotificationAsRead = (notificationId: string) =>
  api.patch<{ item: UserNotificationItem; message: string }>(`/notifications/${notificationId}/read`);

export const markAllNotificationsAsRead = () =>
  api.patch<{ message: string; updatedCount: number }>("/notifications/read-all");

export const sendAdminNotification = (payload: {
  title: string;
  message: string;
  type: NotificationType;
  audienceType: NotificationAudienceType;
  selectedUserIds?: string[];
  idempotencyKey?: string;
}) =>
  api.post<{
    message: string;
    deduplicated: boolean;
    insertedCount: number;
    broadcast: NotificationBroadcastItem;
  }>("/admin/notifications/send", payload);

export const fetchAdminNotificationBroadcasts = (params?: { page?: number; limit?: number }) =>
  api.get<{ items: NotificationBroadcastItem[]; pagination: NotificationPagination }>("/admin/notifications/broadcasts", { params });
