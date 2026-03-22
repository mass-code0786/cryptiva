import test from "node:test";
import assert from "node:assert/strict";

import { __resetSalarySchedulerStateForTests, runSalarySchedulerTick } from "./salarySchedulerService.js";

test("salary scheduler triggers on Sunday 06:00 UTC", async () => {
  __resetSalarySchedulerStateForTests();
  let runs = 0;
  const logs = [];

  await runSalarySchedulerTick({
    nowFn: () => new Date("2026-03-22T06:00:00.000Z"), // Sunday
    runWeeklySalaryDistributionFn: async () => {
      runs += 1;
      return { credited: 1, totalUsers: 1 };
    },
    logger: {
      log: (...args) => logs.push(args.join(" ")),
      error: () => {},
    },
  });

  assert.equal(runs, 1);
  assert.equal(logs.some((line) => line.includes("[salary] weekly payout triggered at")), true);
});

test("salary scheduler does not run twice for same UTC week", async () => {
  __resetSalarySchedulerStateForTests();
  let runs = 0;

  const deps = {
    nowFn: () => new Date("2026-03-22T06:00:00.000Z"), // Sunday
    runWeeklySalaryDistributionFn: async () => {
      runs += 1;
      return { credited: 1, totalUsers: 1 };
    },
    logger: {
      log: () => {},
      error: () => {},
    },
  };

  await runSalarySchedulerTick(deps);
  await runSalarySchedulerTick(deps);

  assert.equal(runs, 1);
});

test("salary scheduler skips non-trigger time", async () => {
  __resetSalarySchedulerStateForTests();
  let runs = 0;

  await runSalarySchedulerTick({
    nowFn: () => new Date("2026-03-22T05:59:00.000Z"), // Sunday but not 06:00 UTC
    runWeeklySalaryDistributionFn: async () => {
      runs += 1;
      return { credited: 1, totalUsers: 1 };
    },
    logger: {
      log: () => {},
      error: () => {},
    },
  });

  assert.equal(runs, 0);
});
