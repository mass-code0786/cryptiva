import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../middleware/errorHandler.js";
import { validateStrongPassword } from "./passwordPolicyService.js";

test("accepts a strong password", () => {
  assert.doesNotThrow(() => {
    validateStrongPassword("StrongPass1!");
  });
});

test("rejects weak password missing uppercase", () => {
  assert.throws(
    () => {
      validateStrongPassword("weakpass1!");
    },
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});

test("rejects weak password missing special character", () => {
  assert.throws(
    () => {
      validateStrongPassword("StrongPass1");
    },
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});

test("rejects password with whitespace", () => {
  assert.throws(
    () => {
      validateStrongPassword("Strong Pass1!");
    },
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});
