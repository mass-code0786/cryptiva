export const checkAdmin = (req, res, next) => {
  const hasAdminRole = req.user?.role === "admin" || req.user?.isAdmin === true;
  if (!hasAdminRole) {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};

export const requireAdmin = checkAdmin;
