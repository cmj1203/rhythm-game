/** The best finished play of each song, kept in this browser only, so every device has its own. */
const BEST_KEY = "livecanvas.best";

export type Best = { readonly grade: number; readonly score: number };

function isBest(value: unknown): value is Best {
  if (typeof value !== "object" || value === null) return false;
  const { grade, score } = value as Record<string, unknown>;
  return typeof grade === "number" && Number.isFinite(grade) && typeof score === "number" && Number.isFinite(score);
}

/** Every song's best, by song id. Anything saved that does not read as a best is left out. */
export function loadBests(): ReadonlyMap<string, Best> {
  const saved = localStorage.getItem(BEST_KEY);
  if (saved === null) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch (error) {
    if (error instanceof SyntaxError) return new Map();
    throw error;
  }
  if (typeof parsed !== "object" || parsed === null) return new Map();
  return new Map(Object.entries(parsed).filter((entry): entry is [string, Best] => isBest(entry[1])));
}

function saveBests(bests: ReadonlyMap<string, Best>): void {
  localStorage.setItem(BEST_KEY, JSON.stringify(Object.fromEntries(bests)));
}

/**
 * Keeps `play` as the song's best if it beats the one kept: a higher mark, or the same mark with a higher score.
 * Gives the best kept after it, and whether that is `play`.
 */
export function recordBest(songId: string, play: Best): { readonly best: Best; readonly isNew: boolean } {
  const bests = new Map(loadBests());
  const kept = bests.get(songId);
  if (kept !== undefined && (play.grade < kept.grade || (play.grade === kept.grade && play.score <= kept.score))) {
    return { best: kept, isNew: false };
  }
  const best = { grade: play.grade, score: play.score };
  bests.set(songId, best);
  saveBests(bests);
  return { best, isNew: true };
}
