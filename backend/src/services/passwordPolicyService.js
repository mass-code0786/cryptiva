import { ApiError } from "../middleware/errorHandler.js";

const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  forbidWhitespace: true,
};

export const getPasswordPolicy = () => ({ ...PASSWORD_POLICY });

export const validateStrongPassword = (password, fieldName = "Password") => {
  const value = String(password || "");

  if (value.length < PASSWORD_POLICY.minLength || value.length > PASSWORD_POLICY.maxLength) {
    throw new ApiError(
      400,
      `${fieldName} must be ${PASSWORD_POLICY.minLength}-${PASSWORD_POLICY.maxLength} characters long`
    );
  }

  if (PASSWORD_POLICY.forbidWhitespace && /\s/.test(value)) {
    throw new ApiError(400, `${fieldName} must not contain spaces`);
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(value)) {
    throw new ApiError(400, `${fieldName} must include at least one uppercase letter`);
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(value)) {
    throw new ApiError(400, `${fieldName} must include at least one lowercase letter`);
  }

  if (PASSWORD_POLICY.requireDigit && !/\d/.test(value)) {
    throw new ApiError(400, `${fieldName} must include at least one number`);
  }

  if (PASSWORD_POLICY.requireSpecial && !/[^A-Za-z0-9]/.test(value)) {
    throw new ApiError(400, `${fieldName} must include at least one special character`);
  }
};
