export type LevelStatusRow = {
  level: number;
  status: "open" | "locked";
};

export function toLevelStatusRows(levelStatus?: Array<Partial<LevelStatusRow>>, maxLevels?: number): LevelStatusRow[];
