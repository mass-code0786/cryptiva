import { runWeeklySalaryDistribution } from "../controllers/salaryController.js";

const SALARY_SCHEDULER_INTERVAL_MS = 60 * 1000;
const SALARY_WEEKLY_CRON_UTC = "0 6 * * 0"; // Sunday 06:00 UTC (11:30 IST)
const [SALARY_DISTRIBUTION_MIN_UTC_MINUTE, SALARY_DISTRIBUTION_UTC_HOUR, , , SALARY_DISTRIBUTION_UTC_DAY] =
  SALARY_WEEKLY_CRON_UTC.split(" ").map((part, index) => (index <= 1 || index === 4 ? Number(part) : part));

let salarySchedulerTimer = null;
let lastRunWeekKey = "";
let salarySchedulerRunning = false;

const getWeekKey = (referenceDate = new Date()) => {
  const ref = new Date(referenceDate);
  const day = ref.getUTCDay();
  const weekStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - day, 0, 0, 0, 0));
  return weekStart.toISOString().slice(0, 10);
};

const shouldRunNow = (now = new Date()) => {
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  return (
    utcDay === SALARY_DISTRIBUTION_UTC_DAY &&
    utcHour === SALARY_DISTRIBUTION_UTC_HOUR &&
    utcMinute === SALARY_DISTRIBUTION_MIN_UTC_MINUTE
  );
};

export const runSalarySchedulerTick = async (deps = {}) => {
  const nowFn = deps.nowFn || (() => new Date());
  const runWeeklySalaryDistributionFn = deps.runWeeklySalaryDistributionFn || runWeeklySalaryDistribution;
  const logger = deps.logger || console;

  if (salarySchedulerRunning) {
    return;
  }

  const now = nowFn();
  if (!shouldRunNow(now)) {
    return;
  }

  const weekKey = getWeekKey(now);
  if (lastRunWeekKey === weekKey) {
    return;
  }

  salarySchedulerRunning = true;
  try {
    logger.log("[salary] weekly payout triggered at", now.toISOString());
    const result = await runWeeklySalaryDistributionFn(now);
    lastRunWeekKey = weekKey;
    logger.log(
      `[SalaryScheduler] Weekly salary run completed for week ${weekKey}: credited=${result.credited}, users=${result.totalUsers}`
    );
  } catch (error) {
    logger.error("[SalaryScheduler] Weekly salary run failed", error);
  } finally {
    salarySchedulerRunning = false;
  }
};

export const startSalaryScheduler = () => {
  if (salarySchedulerTimer) {
    return;
  }

  salarySchedulerTimer = setInterval(() => {
    runSalarySchedulerTick().catch((error) => {
      console.error("[SalaryScheduler] Tick failed", error);
    });
  }, SALARY_SCHEDULER_INTERVAL_MS);

  runSalarySchedulerTick().catch((error) => {
    console.error("[SalaryScheduler] Initial tick failed", error);
  });
};

export const __resetSalarySchedulerStateForTests = () => {
  if (salarySchedulerTimer) {
    clearInterval(salarySchedulerTimer);
    salarySchedulerTimer = null;
  }
  lastRunWeekKey = "";
  salarySchedulerRunning = false;
};
