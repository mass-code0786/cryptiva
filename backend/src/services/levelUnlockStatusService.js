import { getQualifiedDirectCountForWorkingUser } from "./incomeCapService.js";
import { computeUnlockedLevelsFromQualifiedDirects } from "./levelIncomeSchedulerService.js";

export const MAX_UNLOCKED_LEVELS = 30;

export const buildLevelStatus = (unlockedLevels, maxLevels = MAX_UNLOCKED_LEVELS) => {
  const safeUnlocked = Math.max(0, Math.min(Number(unlockedLevels) || 0, Number(maxLevels) || MAX_UNLOCKED_LEVELS));
  const safeMax = Math.max(1, Number(maxLevels) || MAX_UNLOCKED_LEVELS);
  return Array.from({ length: safeMax }, (_, index) => {
    const level = index + 1;
    return {
      level,
      status: level <= safeUnlocked ? "open" : "locked",
    };
  });
};

export const getUserLevelUnlockStatus = async (userId, deps = {}) => {
  const qualifiedDirectCount = Number(await getQualifiedDirectCountForWorkingUser(userId, deps)) || 0;
  const unlockedLevels = computeUnlockedLevelsFromQualifiedDirects(qualifiedDirectCount);
  const maxLevels = MAX_UNLOCKED_LEVELS;

  return {
    qualifiedDirectCount,
    unlockedLevels,
    maxLevels,
    levelStatus: buildLevelStatus(unlockedLevels, maxLevels),
  };
};
