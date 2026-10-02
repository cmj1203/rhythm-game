import type { ChartNote } from "./chart";

export const JUDGEMENTS = ["perfect", "great", "good", "miss"] as const;
export type Judgement = (typeof JUDGEMENTS)[number];
export type Rank = "S" | "A" | "B" | "C";
type HitJudgement = Exclude<Judgement, "miss">;

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
const RANK_THRESHOLDS = [
  { rank: "S", atLeast: 0.95 },
  { rank: "A", atLeast: 0.85 },
  { rank: "B", atLeast: 0.7 },
] as const;

type NoteStatus = "pending" | "holding" | "hit" | "missed";

/** `end` is the release time of a hold note and null for a tap. */
export type PlayNote = {
  readonly t: number;
  readonly lane: number;
  readonly end: number | null;
  status: NoteStatus;
};

/** `lane` is null for a miss, which belongs to no key press. */
export type JudgeEvent = { readonly judgement: Judgement; readonly lane: number | null; readonly offsetMs: number };

type ActiveHold = { readonly note: PlayNote; readonly end: number; readonly judgement: HitJudgement };

const MISS: JudgeEvent = { judgement: "miss", lane: null, offsetMs: 0 };

/**
 * Mutable by design: accumulates score, combo and per-note status for one play of one chart.
 * A hold is judged twice, once when pressed and once when its end is reached while still held.
 */
export class PlayState {
  readonly notes: readonly PlayNote[];
  readonly counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  score = 0;
  combo = 0;
  maxCombo = 0;
  private readonly judgedTotal: number;
  private readonly activeHolds = new Map<number, ActiveHold>();
  private pressCount = 0;
  private offsetSumMs = 0;
  private oldestLiveIndex = 0;

  constructor(chartNotes: readonly ChartNote[]) {
    this.notes = chartNotes.map(
      (note): PlayNote => ({ t: note.t, lane: note.lane, end: note.end ?? null, status: "pending" }),
    );
    this.judgedTotal = this.notes.length + this.notes.filter((note) => note.end !== null).length;
  }

  hit(lane: number, songTime: number): JudgeEvent | null {
    for (let i = this.oldestLiveIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note === undefined || note.t - songTime > MAX_WINDOW_S) break;
      if (note.lane !== lane || note.status !== "pending") continue;

      const offsetS = songTime - note.t;
      const window = HIT_WINDOWS.find((w) => Math.abs(offsetS) <= w.withinS);
      if (window === undefined) continue;

      this.award(window.judgement);
      this.pressCount += 1;
      this.offsetSumMs += offsetS * 1000;
      if (note.end === null) {
        note.status = "hit";
      } else {
        note.status = "holding";
        this.activeHolds.set(lane, { note, end: note.end, judgement: window.judgement });
      }
      return { judgement: window.judgement, lane, offsetMs: offsetS * 1000 };
    }
    return null;
  }

  release(lane: number, songTime: number): JudgeEvent | null {
    const hold = this.activeHolds.get(lane);
    if (hold === undefined) return null;
    if (hold.end - songTime <= MAX_WINDOW_S) return this.completeHold(hold);

    this.activeHolds.delete(lane);
    hold.note.status = "missed";
    this.miss();
    return MISS;
  }

  /** Completes holds that reached their end and misses notes that went past the hit window. */
  advance(songTime: number): readonly JudgeEvent[] {
    const events: JudgeEvent[] = [];
    for (const hold of [...this.activeHolds.values()]) {
      if (songTime >= hold.end) events.push(this.completeHold(hold));
    }
    for (;;) {
      const note = this.notes[this.oldestLiveIndex];
      if (note === undefined || songTime - note.t <= MAX_WINDOW_S) break;
      if (note.status === "pending") {
        note.status = "missed";
        this.miss();
        if (note.end !== null) this.miss();
        events.push(MISS);
      }
      this.oldestLiveIndex += 1;
    }
    return events;
  }

  get hasHits(): boolean {
    return this.pressCount > 0;
  }

  get accuracy(): number {
    if (this.judgedTotal === 0) return 0;
    const weighted = JUDGEMENTS.reduce((sum, j) => sum + this.counts[j] * ACCURACY_WEIGHT[j], 0);
    return weighted / this.judgedTotal;
  }

  get meanOffsetMs(): number {
    return this.pressCount === 0 ? 0 : this.offsetSumMs / this.pressCount;
  }

  get rank(): Rank {
    return RANK_THRESHOLDS.find((r) => this.accuracy >= r.atLeast)?.rank ?? "C";
  }

  private award(judgement: HitJudgement): void {
    this.counts[judgement] += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += BASE_SCORE[judgement] + Math.min(this.combo, COMBO_BONUS_CAP) * COMBO_BONUS;
  }

  private miss(): void {
    this.counts.miss += 1;
    this.combo = 0;
  }

  private completeHold(hold: ActiveHold): JudgeEvent {
    this.activeHolds.delete(hold.note.lane);
    hold.note.status = "hit";
    this.award(hold.judgement);
    return { judgement: hold.judgement, lane: hold.note.lane, offsetMs: 0 };
  }
}
