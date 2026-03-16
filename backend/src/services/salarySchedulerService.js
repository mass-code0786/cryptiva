import { runWeeklySalaryDistribution } from "../controllers/salaryController.js";

const SALARY_SCHEDULER_INTERVAL_MS = 10 * 60 * 1000;
const SALARY_DISTRIBUTION_UTC_HOUR = 23;
const SALARY_DISTRIBUTION_MIN_UTC_MINUTE = 50;

let salarySchedulerTimer = null;
let lastRunWeekKey = "";
let salarySchedulerRunning = false;

const getWeekKey = (referenceDate = new Date()) => {
  const ref = new Date(referenceDate);
  const day = ref.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const weekStart = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - diffToMonday, 0, 0, 0, 0));
  return weekStart.toISOString().slice(0, 10);
};

const shouldRunNow = (now = new Date()) => {
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  return utcDay === 0 && utcHour === SALARY_DISTRIBUTION_UTC_HOUR && utcMinute >= SALARY_DISTRIBUTION_MIN_UTC_MINUTE;
};

const runSalarySchedulerTick = async () => {
  if (salarySchedulerRunning) {
    return;
  }

  const now = new Date();
  if (!shouldRunNow(now)) {
    return;
  }

  const weekKey = getWeekKey(now);
  if (lastRunWeekKey === weekKey) {
    return;
  }

  salarySchedulerRunning = true;
  try {
    const result = await runWeeklySalaryDistribution(now);
    lastRunWeekKey = weekKey;
    console.log(
      `[SalaryScheduler] Weekly salary run completed for week ${weekKey}: credited=${result.credited}, users=${result.totalUsers}`
    );
  } catch (error) {
    console.error("[SalaryScheduler] Weekly salary run failed", error);
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
