export const toLevelStatusRows = (levelStatus = [], maxLevels = 30) => {
  const safeMax = Math.max(1, Number(maxLevels) || 30);
  const incoming = Array.isArray(levelStatus) ? levelStatus : [];
  const byLevel = new Map(
    incoming.map((row) => [Number(row?.level || 0), String(row?.status || "").toLowerCase() === "open" ? "open" : "locked"])
  );

  return Array.from({ length: safeMax }, (_, index) => {
    const level = index + 1;
    return {
      level,
      status: byLevel.get(level) || "locked",
    };
  });
};
