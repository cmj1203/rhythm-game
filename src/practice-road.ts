import { judgementOf, PlayState } from "./judge";
import { buildRhythmPath, type RhythmPath } from "./rhythm-road";
import type { Feedback, PlayingFrame } from "./track";

/**
 * One lap of the practice road, in beats between notes: a rest that turns, straight beats and half-beat turns both
 * ways, with a turn-around after the notes at `PRACTICE_TWIRLS`. A lap comes back to where and how it started, so
 * lap after lap is laid on the same road and the practice never runs out of road.
 */
export const PRACTICE_BPM = 120;
export const PRACTICE_LAP = [3, 0.5, 1, 0.5, 1, 1, 0.5, 1, 0.5, 0.5, 0.5, 0.5] as const;
// Not on the note after the rest: that one already speeds up again (pink), and the two must not share a tile.
const PRACTICE_TWIRLS = [9, 10] as const;
/** Laps laid in all; the crayon walks the one at `WALKED_LAP`, with sewn laps under it and laps to come ahead. */
const LAPS = 5;
const WALKED_LAP = 2;
/**
 * While the crayon waits past its first touch, the tiles still to come are kept this far after the moment, so that
 * they stay ahead without jumping a whole turn later at each touch, and the camera that follows them glides.
 */
const WAITING_AHEAD_S = 0.001;

export type PracticePress = {
  readonly judgement: NonNullable<ReturnType<typeof judgementOf>> | "miss";
  readonly offsetS: number;
};

/**
 * A rhythm road that waits for the player. The crayon keeps turning on the tile it stands on, at the pace of the
 * note it waits for, and steps on to the next tile only when a press comes near enough to a moment its point
 * touches that tile's ring; it may come round as many times as it takes. Each landed note keeps how much later than
 * written it was reached, and the press it was hit with.
 */
export class PracticeRoad {
  private readonly times: readonly number[];
  private readonly path: RhythmPath;
  private readonly lapNotes = PRACTICE_LAP.length;
  private readonly first = WALKED_LAP * PRACTICE_LAP.length;
  private readonly lapS: number;
  private landed: number;
  private readonly delay: number[];
  private readonly offsets: number[];
  /** Song time when the practice began. */
  private origin: number;

  constructor(private readonly burstS: number) {
    const beat = 60 / PRACTICE_BPM;
    const times = [0];
    for (let lap = 0; lap < LAPS; lap++) for (const gap of PRACTICE_LAP) times.push((times.at(-1) ?? 0) + gap * beat);
    this.times = times;
    const twirls = Array.from({ length: LAPS }, (_, lap) =>
      PRACTICE_TWIRLS.map((note) => times[lap * PRACTICE_LAP.length + note] ?? 0)).flat();
    const laid = buildRhythmPath(times, [[0, PRACTICE_BPM]], undefined, twirls);
    // Every lap repeats the one before, so the phrase brackets would mark the whole road: they are left out.
    this.path = { ...laid, rhythm: { ...laid.rhythm, phrases: [] } };
    this.lapS = (times[this.first + this.lapNotes] ?? 0) - (times[this.first] ?? 0);
    this.landed = this.first;
    this.delay = times.map(() => 0);
    this.offsets = times.map(() => 0);
    this.origin = times[this.first] ?? 0;
  }

  /** The song time `elapsedS` seconds after the practice began. */
  songTimeAt(elapsedS: number): number {
    return this.origin + elapsedS;
  }

  /** How long the crayon takes to come all the way round on the tile it stands on. */
  private turnS(): number {
    const sweep = this.path.sweeps[this.landed + 1];
    const gap = (this.times[this.landed + 1] ?? 0) - (this.times[this.landed] ?? 0);
    return sweep === undefined ? Number.POSITIVE_INFINITY : (2 * Math.PI * gap) / Math.abs(sweep.angle);
  }

  /** When the crayon's point first touches the next tile's ring after landing. */
  private firstContact(): number {
    return (this.times[this.landed + 1] ?? Number.POSITIVE_INFINITY) + (this.delay[this.landed] ?? 0);
  }

  /** The first moment after `songTime` that the point touches the next ring. */
  private nextContact(songTime: number): number {
    const first = this.firstContact();
    if (songTime < first) return first;
    const turn = this.turnS();
    return first + (Math.floor((songTime - first) / turn) + 1) * turn;
  }

  /** Whether the point touched the next ring within `withinS` before `songTime`. */
  touchedWithin(songTime: number, withinS: number): boolean {
    const since = songTime - (this.nextContact(songTime) - this.turnS());
    return songTime >= this.firstContact() && since <= withinS;
  }

  /** Judges a press at `songTime` against the nearest moment the point touches the next ring; a hit steps on. */
  press(songTime: number): PracticePress {
    const first = this.firstContact();
    const turn = this.turnS();
    const contact = first + Math.max(0, Math.round((songTime - first) / turn)) * turn;
    const offsetS = songTime - contact;
    const judgement = judgementOf(offsetS);
    if (judgement === null) return { judgement: "miss", offsetS };
    this.landed += 1;
    this.delay[this.landed] = contact - (this.times[this.landed] ?? 0);
    this.offsets[this.landed] = offsetS;
    if (this.landed >= this.first + this.lapNotes) this.nextLap();
    return { judgement, offsetS };
  }

  /** Walks the same lap again: everything is moved back one lap, which lies on the very same road. */
  private nextLap(): void {
    for (let i = 0; i + this.lapNotes < this.times.length; i++) {
      this.delay[i] = this.delay[i + this.lapNotes] ?? 0;
      this.offsets[i] = this.offsets[i + this.lapNotes] ?? 0;
    }
    this.landed -= this.lapNotes;
    this.origin -= this.lapS;
  }

  /** The practice road at `songTime`, drawn by the game: notes landed so far hit as pressed, the rest still ahead. */
  frameAt(songTime: number): PlayingFrame {
    const ahead = Math.max(this.firstContact(), songTime + WAITING_AHEAD_S) - (this.times[this.landed + 1] ?? 0);
    const at = this.times.map((time, i) => time + (i <= this.landed ? this.delay[i] ?? 0 : ahead));
    const contact = this.firstContact();
    const path: RhythmPath = {
      ...this.path,
      tiles: this.path.tiles.map((tile, i) => (i === 0 ? tile : { ...tile, time: at[i - 1] ?? tile.time })),
      sweeps: this.path.sweeps.map((sweep, i) => {
        if (i === 0) return sweep;
        const startTime = at[i - 1] ?? sweep.startTime;
        // The sweep the crayon waits on keeps its own pace: it turns on past its first contact at the same speed.
        const endTime = i === this.landed + 1 ? contact : at[i] ?? startTime + (sweep.endTime - sweep.startTime);
        return { ...sweep, startTime, endTime };
      }),
    };
    const play = new PlayState(at);
    let feedback: Feedback | null = null;
    const bursts: Feedback[] = [];
    for (let i = 0; i <= this.landed; i++) {
      const pressed = (at[i] ?? 0) + (this.offsets[i] ?? 0);
      const hit = play.press(pressed);
      if (hit === null) continue;
      feedback = { ...hit, at: pressed, accent: false };
      if (songTime - pressed <= this.burstS) bursts.push(feedback);
    }
    return {
      kind: "playing", phase: "playing", play, path, sections: [], songTime,
      duration: at.at(-1) ?? 0, feedback, bursts,
    };
  }
}
