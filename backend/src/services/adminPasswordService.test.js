import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

import { resetUserPasswordByAdminAction } from "./adminPasswordService.js";

const createUserMock = async ({ id, userId, isAdmin = false, password }) => {
  const user = {
    _id: id,
    userId,
    name: `${userId}-name`,
    email: `${String(userId).toLowerCase()}@mail.test`,
    isAdmin,
    forcePasswordChange: false,
    passwordHash: await bcrypt.hash(password, 10),
    async setPassword(nextPassword) {
      this.passwordHash = await bcrypt.hash(nextPassword, 10);
    },
    async comparePassword(candidate) {
      return bcrypt.compare(candidate, this.passwordHash);
    },
    async save() {
      return this;
    },
  };

  return user;
};

test("admin can reset user password and audit is recorded", async () => {
  const actor = await createUserMock({ id: "admin-1", userId: "CTV-ADMIN", isAdmin: true, password: "Admin#1234" });
  const target = await createUserMock({ id: "user-1", userId: "CTV-USER1", password: "OldPass#123" });
  const activityCalls = [];

  const result = await resetUserPasswordByAdminAction({
    actor,
    target,
    newPassword: "NewPass#123",
    confirmPassword: "NewPass#123",
    createActivityLogFn: async (payload) => {
      activityCalls.push(payload);
    },
  });

  assert.equal(result.message, "User password reset successfully");
  assert.equal(result.user.userId, "CTV-USER1");
  assert.equal(target.forcePasswordChange, true);
  assert.equal(await target.comparePassword("OldPass#123"), false);
  assert.equal(await target.comparePassword("NewPass#123"), true);
  assert.equal(activityCalls.length, 1);
  assert.equal(activityCalls[0].type, "admin_password_reset");
});

test("non-admin cannot reset a user password", async () => {
  const actor = await createUserMock({ id: "user-2", userId: "CTV-NONADMIN", isAdmin: false, password: "User#12345" });
  const target = await createUserMock({ id: "user-3", userId: "CTV-TARGET", password: "OldPass#123" });

  await assert.rejects(
    () =>
      resetUserPasswordByAdminAction({
        actor,
        target,
        newPassword: "NewPass#123",
        confirmPassword: "NewPass#123",
      }),
    (error) => error?.statusCode === 403 && error?.message === "Admin only"
  );
});

test("old password no longer works after admin reset", async () => {
  const actor = await createUserMock({ id: "admin-2", userId: "CTV-ADMIN2", isAdmin: true, password: "Admin#9876" });
  const target = await createUserMock({ id: "user-4", userId: "CTV-LOGIN", password: "Start#1234" });

  await resetUserPasswordByAdminAction({
    actor,
    target,
    newPassword: "Changed#789",
    confirmPassword: "Changed#789",
  });

  assert.equal(await target.comparePassword("Start#1234"), false);
  assert.equal(await target.comparePassword("Changed#789"), true);
});
