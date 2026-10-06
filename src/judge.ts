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
/** A note that goes by with no press at all for it waits this long after its beat for a late one; if none comes, the game is over. */
const LATE_GRACE_S = 0.3;

/** The judgement of a press `offsetS` seconds off the beat, or null if that is too far off to count. */
export function judgementOf(offsetS: number): HitJudgement | null {
  return HIT_WINDOWS.find((window) => Math.abs(offsetS) <= window.withinS)?.judgement ?? null;
}

/** `index` is the note the judgement belongs to. */
export type JudgeEvent = { readonly judgement: Judgement; readonly index: number; readonly offsetMs: number };

/**
 * Mutable by design: accumulates score and combo for one play of one chart.
 * Notes are judged strictly in order. A note pressed for but missed (too early or too late) is skipped so the
 * song keeps going; a note let go by without a single press ends the game.
 */
export class PlayState {
  readonly counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  score = 0;
  combo = 0;
  maxCombo = 0;
  /** The judgement of each note so far, in note order. The finished embroidery is drawn from it. */
  readonly history: Judgement[] = [];
  /** The song time at which the game ended for a note that was never pressed for, or null while it goes on. */
  overAt: number | null = null;
  private nextIndex = 0;
  /** The song time of the last press, counted or not; null before the first. */
  private lastPressAt: number | null = null;
  /** When the note now due became due: when the note before it was hit or missed. */
  private turnStart = Number.NEGATIVE_INFINITY;
  /** Until when a note that went by without a press waits for a late one; null when none is waiting. */
  private lateDeadline: number | null = null;

  constructor(readonly times: readonly number[]) {}

  /** How many notes are already judged, which is also the index of the tile the ball stands on. */
  get resolvedCount(): number {
    return this.nextIndex;
  }

  press(songTime: number): JudgeEvent | null {
    if (this.overAt !== null) return null;
    // Any press, even one too far off to count, shows the player is still playing: a note that went by
    // unpressed just before stays a miss, but the game goes on. The press is judged against the next note as usual.
    this.lastPressAt = songTime;
    this.lateDeadline = null;
    const time = this.times[this.nextIndex];
    if (time === undefined) return null;
    const offsetS = songTime - time;
    const judgement = judgementOf(offsetS);
    if (judgement === null) return null;

    this.turnStart = songTime;
    this.counts[judgement] += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += BASE_SCORE[judgement] + Math.min(this.combo, COMBO_BONUS_CAP) * COMBO_BONUS;
    const index = this.nextIndex;
    this.history.push(judgement);
    this.nextIndex += 1;
    return { judgement, index, offsetMs: offsetS * 1000 };
  }

  /**
   * Misses every note that went past the hit window, and ends the game once a note let go by without a press
   * has waited out its late press.
   */
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
      if (!wasPressedFor && this.lateDeadline === null) this.lateDeadline = time + LATE_GRACE_S;
      this.turnStart = time + MAX_WINDOW_S;
    }
    if (this.lateDeadline !== null && songTime > this.lateDeadline) this.overAt = this.lateDeadline;
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
