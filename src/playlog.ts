import { z } from "zod";
import { DIFFICULTIES } from "./chart";
import { readStoredJson, writeStored } from "./storage";

/** Every play's numbers, kept in this browser only: a date and counts, nothing that says who or when in the day. */
const PLAYLOG_KEY = "livecanvas.playlog.v1";
const MAX_PER_SONG = 30;

const count = z.number().int().nonnegative();
const playSchema = z.object({
  songId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  difficulty: z.enum(DIFFICULTIES),
  notes: count,
  perfect: count,
  great: count,
  good: count,
  missPressed: count,
  missUnpressed: count,
  maxStrain: z.number().nonnegative().finite(),
  gameOver: z.boolean(),
  lagMs: z.number().finite(),
});

export type PlayRecord = z.infer<typeof playSchema>;

/** Today as YYYY-MM-DD on this device's clock. */
export function today(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The kept plays, oldest first. A value that is not a list reads as empty; entries that do not read as a play are dropped. */
export function loadPlaylog(storage?: Pick<Storage, "getItem">): readonly PlayRecord[] {
  // 브라우저가 저장소를 막으면 기록이 없는 것으로 읽는다.
  const stored = readStoredJson(PLAYLOG_KEY, storage);
  if (stored.kind !== "value" || !Array.isArray(stored.value)) return [];
  return stored.value.flatMap((entry: unknown) => {
    const result = playSchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

/**
 * Adds `play` as the newest and keeps only the last `MAX_PER_SONG` plays of its song.
 * A save the browser refuses (storage full or blocked) is reported with a warning and not thrown, so a play that
 * cannot be logged never keeps the rest of the play's ending, such as saving the best, from running.
 */
export function recordPlay(play: PlayRecord, storage?: Pick<Storage, "getItem" | "setItem">): void {
  const all = [...loadPlaylog(storage), playSchema.parse(play)];
  const seen = new Map<string, number>();
  const kept = all
    .reverse()
    .filter((entry) => {
      const n = (seen.get(entry.songId) ?? 0) + 1;
      seen.set(entry.songId, n);
      return n <= MAX_PER_SONG;
    })
    .reverse();
  writeStored(PLAYLOG_KEY, JSON.stringify(kept), storage);
}
