import { ApiError } from "./errorHandler.js";

export const requireAdmin = (req, _res, next) => {
  if (!req.user?.isAdmin) {
    return next(new ApiError(403, "Admin access required"));
  }

  next();
};
