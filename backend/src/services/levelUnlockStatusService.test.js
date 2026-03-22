import test from "node:test";
import assert from "node:assert/strict";

import { buildLevelStatus, getUserLevelUnlockStatus } from "./levelUnlockStatusService.js";

const USER_ID = "507f191e810c19729de860eb";

test("0 qualified directs => 0 levels open, all locked", async () => {
  const result = await getUserLevelUnlockStatus(USER_ID, {
    getActivationInvestmentByUserIdsFn: async () => new Map(),
    UserModel: {
      findById: () => ({ select: async () => ({ _id: USER_ID, userId: "ABCD" }) }),
      find: async () => [],
    },
  });

  assert.equal(result.qualifiedDirectCount, 0);
  assert.equal(result.unlockedLevels, 0);
  assert.equal(result.maxLevels, 30);
  assert.equal(result.levelStatus.length, 30);
  assert.equal(result.levelStatus.every((row) => row.status === "locked"), true);
});

test("1 qualified direct => levels 1-2 open", () => {
  const levelStatus = buildLevelStatus(2, 30);
  assert.equal(levelStatus[0].status, "open");
  assert.equal(levelStatus[1].status, "open");
  assert.equal(levelStatus[2].status, "locked");
});

test("3 qualified directs => levels 1-6 open", () => {
  const levelStatus = buildLevelStatus(6, 30);
  for (let i = 0; i < 6; i += 1) {
    assert.equal(levelStatus[i].status, "open");
  }
  assert.equal(levelStatus[6].status, "locked");
});

test("15+ qualified directs => max 30 levels open", () => {
  const levelStatus = buildLevelStatus(60, 30);
  assert.equal(levelStatus.length, 30);
  assert.equal(levelStatus.every((row) => row.status === "open"), true);
});
