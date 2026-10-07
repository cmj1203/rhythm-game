export const JUDGEMENTS = ["perfect", "great", "good", "miss"] as const;
export type Judgement = (typeof JUDGEMENTS)[number];
export type HitJudgement = Exclude<Judgement, "miss">;

const HIT_WINDOWS = [
  { judgement: "perfect", withinS: 0.04 },
  { judgement: "great", withinS: 0.08 },
  { judgement: "good", withinS: 0.12 },
] as const;
const MAX_WINDOW_S = 0.12;
const BASE_SCORE = { perfect: 1000, great: 600, good: 300 } as const satisfies Record<HitJudgement, number>;
const ACCURACY_WEIGHT = { perfect: 1, great: 0.7, good: 0.4, miss: 0 } as const satisfies Record<Judgement, number>;
const COMBO_BONUS = 10;
const COMBO_BONUS_CAP = 100;
/**
 * Misses bring a game over nearer and hits take it away again, counted in hits: a note pressed for but missed (too
 * early or too late) costs `PRESSED_MISS_STRAIN`, a note let go by without a single press half as much again, and
 * each hit takes one away. The game is over once the strain reaches `OVER_STRAIN`: five pressed misses in a row.
 */
const PRESSED_MISS_STRAIN = 4;
const UNPRESSED_MISS_STRAIN = 6;
const OVER_STRAIN = 20;

/** The judgement of a press `offsetS` seconds off the beat, or null if that is too far off to count. */
export function judgementOf(offsetS: number): HitJudgement | null {
  return HIT_WINDOWS.find((window) => Math.abs(offsetS) <= window.withinS)?.judgement ?? null;
}

/** `index` is the note the judgement belongs to. */
export type JudgeEvent = { readonly judgement: Judgement; readonly index: number; readonly offsetMs: number };

/**
 * Mutable by design: accumulates score and combo for one play of one chart.
 * Notes are judged strictly in order. A missed note is skipped so the song keeps going, but misses add up toward
 * a game over and hits take it away again (see `OVER_STRAIN`).
 */
export class PlayState {
  readonly counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  score = 0;
  combo = 0;
  maxCombo = 0;
  /** The judgement of each note so far, in note order. The finished embroidery is drawn from it. */
  readonly history: Judgement[] = [];
  /** The song time of the miss that ended the game, or null while it goes on. */
  overAt: number | null = null;
  private nextIndex = 0;
  /** The song time of the last press, counted or not; null before the first. */
  private lastPressAt: number | null = null;
  /** When the note now due became due: when the note before it was hit or missed. */
  private turnStart = Number.NEGATIVE_INFINITY;
  /** The misses not yet made up for by hits, counted as `OVER_STRAIN` counts them. */
  private strain = 0;

  constructor(readonly times: readonly number[]) {}

  /** How many notes are already judged, which is also the index of the tile the ball stands on. */
  get resolvedCount(): number {
    return this.nextIndex;
  }

  /** How near the game is to over: 0 with no misses left to make up for, 1 at a game over. */
  get danger(): number {
    return Math.min(1, this.strain / OVER_STRAIN);
  }

  press(songTime: number): JudgeEvent | null {
    if (this.overAt !== null) return null;
    // Any press, even one too far off to count, means the note now due was pressed for, so missing it costs less.
    this.lastPressAt = songTime;
    const time = this.times[this.nextIndex];
    if (time === undefined) return null;
    const offsetS = songTime - time;
    const judgement = judgementOf(offsetS);
    if (judgement === null) return null;

    this.turnStart = songTime;
    this.strain = Math.max(0, this.strain - 1);
    this.counts[judgement] += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += BASE_SCORE[judgement] + Math.min(this.combo, COMBO_BONUS_CAP) * COMBO_BONUS;
    const index = this.nextIndex;
    this.history.push(judgement);
    this.nextIndex += 1;
    return { judgement, index, offsetMs: offsetS * 1000 };
  }

  /** Misses every note that went past the hit window, and ends the game once the misses add up to `OVER_STRAIN`. */
  advance(songTime: number): readonly JudgeEvent[] {
    const events: JudgeEvent[] = [];
    if (this.overAt !== null) return events;
    for (;;) {
      const time = this.times[this.nextIndex];
      if (time === undefined || songTime - time <= MAX_WINDOW_S) break;
      this.counts.miss += 1;
      this.combo = 0;
      events.push({ judgement: "miss", index: this.nextIndex, offsetMs: 0 });
      this.history.push("miss");
      this.nextIndex += 1;
      // Strictly after: the press that hit the note before belongs to that note, not to this one.
      const wasPressedFor = this.lastPressAt !== null && this.lastPressAt > this.turnStart;
      this.strain += wasPressedFor ? PRESSED_MISS_STRAIN : UNPRESSED_MISS_STRAIN;
      this.turnStart = time + MAX_WINDOW_S;
      if (this.strain >= OVER_STRAIN) {
        this.overAt = this.turnStart;
        break;
      }
    }
    return events;
  }

  get accuracy(): number {
    if (this.times.length === 0) return 0;
    const weighted = JUDGEMENTS.reduce((sum, j) => sum + this.counts[j] * ACCURACY_WEIGHT[j], 0);
    return weighted / this.times.length;
  }

  /** The play as a mark out of 100. It is rounded down, so only a play of nothing but Perfects gets 100. */
  get grade(): number {
    return Math.floor(this.accuracy * 100);
  }
}
