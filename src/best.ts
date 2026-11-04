import { readStoredJson, type StoredJson, writeStored } from "./storage";

/** The best finished play of each song, kept in this browser only, so every device has its own. */
const BEST_KEY = "livecanvas.best";
/** JSON 으로 읽히지 않는 best 저장값을 덮어쓰기 전에 옮겨 두는 곳. 다른 곡 기록을 손으로 되살릴 수 있게 남긴다. */
const CORRUPT_KEY = `${BEST_KEY}.corrupt`;

export type Best = { readonly grade: number; readonly score: number };

function isBest(value: unknown): value is Best {
  if (typeof value !== "object" || value === null) return false;
  const { grade, score } = value as Record<string, unknown>;
  return typeof grade === "number" && Number.isFinite(grade) && typeof score === "number" && Number.isFinite(score);
}

function bestsOf(stored: StoredJson): ReadonlyMap<string, Best> {
  if (stored.kind !== "value") return new Map();
  const parsed = stored.value;
  // 배열은 Object.entries 가 인덱스("0", "1" …)를 곡 id 처럼 만들므로 기록이 아니다.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return new Map();
  return new Map(Object.entries(parsed).filter((entry): entry is [string, Best] => isBest(entry[1])));
}

/** Every song's best, by song id. Anything saved that does not read as a best is left out. */
export function loadBests(): ReadonlyMap<string, Best> {
  // 브라우저가 저장소를 막으면 기록이 없는 것으로 읽는다.
  return bestsOf(readStoredJson(BEST_KEY));
}

/** 브라우저가 저장을 거절하면(가득 참, 막힘) 경고만 남긴다. 곡 끝 처리가 여기서 멈추면 결과 화면이 안 나온다. */
function saveBests(bests: ReadonlyMap<string, Best>): void {
  writeStored(BEST_KEY, JSON.stringify(Object.fromEntries(bests)));
}

/**
 * Keeps `play` as the song's best if it beats the one kept: a higher mark, or the same mark with a higher score.
 * Gives the best kept after it, whether that is `play`, and the best from before this play if there was one.
 */
export function recordBest(
  songId: string,
  play: Best,
): { readonly best: Best; readonly isNew: boolean; readonly previous: Best | null } {
  const stored = readStoredJson(BEST_KEY);
  const bests = new Map(bestsOf(stored));
  const kept = bests.get(songId);
  if (kept !== undefined && (play.grade < kept.grade || (play.grade === kept.grade && play.score <= kept.score))) {
    return { best: kept, isNew: false, previous: kept };
  }
  const best = { grade: play.grade, score: play.score };
  bests.set(songId, best);
  if (stored.kind === "broken") writeStored(CORRUPT_KEY, stored.raw);
  saveBests(bests);
  return { best, isNew: true, previous: kept ?? null };
}
