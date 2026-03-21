import { ApiError } from "../middleware/errorHandler.js";
import { validateStrongPassword } from "./passwordPolicyService.js";

export const resetUserPasswordByAdminAction = async ({
  actor,
  target,
  newPassword,
  confirmPassword,
  createActivityLogFn = async () => {},
}) => {
  if (!actor || actor.isAdmin !== true) {
    throw new ApiError(403, "Admin only");
  }

  if (!target) {
    throw new ApiError(404, "User not found");
  }

  if (target.isAdmin) {
    throw new ApiError(400, "Use admin password change for admin accounts");
  }

  const nextPassword = String(newPassword || "");
  const confirm = confirmPassword === undefined ? null : String(confirmPassword || "");

  if (!nextPassword) {
    throw new ApiError(400, "New password is required");
  }

  if (confirm !== null && confirm !== nextPassword) {
    throw new ApiError(400, "Confirm password does not match new password");
  }

  validateStrongPassword(nextPassword, "New password");
  await target.setPassword(nextPassword);
  target.forcePasswordChange = true;
  await target.save();

  await createActivityLogFn({
    adminId: actor._id,
    type: "admin_password_reset",
    action: "Admin reset user password",
    targetUserId: target._id,
    metadata: {
      targetUserId: target.userId,
      adminUserId: actor.userId,
      forcePasswordChange: true,
    },
  });

  return {
    message: "User password reset successfully",
    user: {
      id: target._id,
      userId: target.userId,
      name: target.name,
      email: target.email,
      forcePasswordChange: Boolean(target.forcePasswordChange),
    },
  };
};
