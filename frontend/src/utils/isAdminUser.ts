type UserLike = {
  role?: string;
  isAdmin?: boolean;
} | null;

export const isAdminUser = (user: UserLike) =>
  String(user?.role || "").toLowerCase() === "admin" || user?.isAdmin === true;
