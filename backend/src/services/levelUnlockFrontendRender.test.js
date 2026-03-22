import test from "node:test";
import assert from "node:assert/strict";

import { toLevelStatusRows } from "../../../frontend/src/utils/levelUnlockStatus.js";

test("frontend level-status helper maps open/locked rows correctly from API response", () => {
  const rows = toLevelStatusRows(
    [
      { level: 1, status: "open" },
      { level: 2, status: "open" },
      { level: 3, status: "locked" },
    ],
    5
  );

  assert.equal(rows.length, 5);
  assert.equal(rows[0].status, "open");
  assert.equal(rows[1].status, "open");
  assert.equal(rows[2].status, "locked");
  assert.equal(rows[3].status, "locked");
  assert.equal(rows[4].status, "locked");
});
