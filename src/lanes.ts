export const LANES = [
  { code: "KeyS", label: "S" },
  { code: "KeyD", label: "D" },
  { code: "Space", label: "Space" },
  { code: "KeyJ", label: "J" },
  { code: "KeyK", label: "K" },
] as const;

export const LANE_COUNT = LANES.length;

export const LANE_BY_CODE: ReadonlyMap<string, number> = new Map(LANES.map((lane, index) => [lane.code, index]));
