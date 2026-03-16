type UserLike = {
  role?: string;
  isAdmin?: boolean;
} | null;

export const isAdminUser = (user: UserLike) => user?.role === "admin" || user?.isAdmin === true;
