import { COLOR, JUDGEMENT_COLOR, Painter } from "./canvas";
import { element } from "./dom";
import { judgementOf, PlayState } from "./judge";
import { buildRhythmPath } from "./rhythm-road";
import { BURST_S, drawRoadOnly, EARLY_LATE_MIN_MS, type Feedback, type PlayingFrame } from "./track";

export type TutorialOptions = {
  readonly root: HTMLElement;
  readonly onDone: () => void;
};

const MARKS = [
  { kind: "fast", name: "분홍 고리", meaning: "노트가 촘촘한 구간입니다. 크레파스가 박자에 맞춰 두 배 빨리 돌고, 도는 원이 분홍색이 됩니다" },
  { kind: "slow", name: "하늘 고리", meaning: "오래 기다리는 칸입니다. 크레파스가 천천히 돌고, 도는 원이 하늘색이 됩니다" },
  { kind: "twirl", name: "보라 고리", meaning: "이 칸에서 크레파스가 도는 방향이 바뀝니다" },
] as const;

/** How long a judgement made on the demo stays up, fading out over the last part of it. */
const JUDGEMENT_SHOWN_MS = 1200;

/**
 * The demo is a rhythm road with no end, played perfectly and drawn as the game draws it. One lap of these gaps (in
 * beats: a rest that turns, straight beats and half-beat turns both ways, a turn-around after the notes at
 * `DEMO_TWIRLS`) comes back to where and how it started, so lap after lap is laid on the same road. The demo plays
 * `DEMO_SHOWN_LAP` over and over: the laps before it are already sewn under it, and the laps after it lie ahead.
 */
const DEMO_BPM = 120;
const DEMO_LAP = [3, 0.5, 1, 0.5, 1, 1, 0.5, 1, 0.5, 0.5, 0.5, 0.5] as const;
const DEMO_TWIRLS = [1, 10] as const;
const DEMO_LAPS = 5;
const DEMO_SHOWN_LAP = 2;
/** The first time the picture shows, it starts this long before a lap. */
const DEMO_LEAD_S = 1;
/** "지금!" shows for this long from each note. */
const NOW_SHOWN_S = 0.18;
/** The still picture shown instead of the loop to someone who asked for less motion. */
const STILL_AT_S = 3.2;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

const DEMO_TIMES = (() => {
  const beat = 60 / DEMO_BPM;
  const times = [0];
  for (let lap = 0; lap < DEMO_LAPS; lap++) {
    for (const gap of DEMO_LAP) times.push((times.at(-1) ?? 0) + gap * beat);
  }
  return times;
})();
const DEMO_PATH = buildRhythmPath(
  DEMO_TIMES,
  [[0, DEMO_BPM]],
  undefined,
  Array.from({ length: DEMO_LAPS }, (_, lap) => DEMO_TWIRLS.map((note) => DEMO_TIMES[lap * DEMO_LAP.length + note] ?? 0)).flat(),
);
const DEMO_LOOP_FROM_S = DEMO_TIMES[DEMO_SHOWN_LAP * DEMO_LAP.length] ?? 0;
const DEMO_PERIOD_S = (DEMO_TIMES[(DEMO_SHOWN_LAP + 1) * DEMO_LAP.length] ?? 0) - DEMO_LOOP_FROM_S;

/** The demo road at `songTime`, every note up to then hit on time. */
function demoFrame(songTime: number): PlayingFrame {
  const play = new PlayState(DEMO_TIMES);
  let feedback: Feedback | null = null;
  const bursts: Feedback[] = [];
  for (const note of DEMO_TIMES) {
    if (note > songTime) break;
    const hit = play.press(note);
    if (hit === null) continue;
    feedback = { ...hit, at: note, accent: false };
    if (songTime - note <= BURST_S) bursts.push(feedback);
  }
  return {
    kind: "playing", phase: "playing", play, path: DEMO_PATH, sections: [], songTime,
    duration: DEMO_TIMES.at(-1) ?? 0, feedback, bursts,
  };
}

export class TutorialScreen {
  private readonly canvas = element("canvas", "demo-road");
  private readonly now = element("span", "demo-now", "지금!");
  private readonly judged = element("p", "tutorial-judgement");
  private startMs = 0;
  private frame = 0;

  constructor(private readonly options: TutorialOptions) {
    const marks = element("ul", "marks");
    for (const { kind, name, meaning } of MARKS) {
      const row = element("li", "mark");
      row.append(
        element("span", `mark-icon mark-${kind}`),
        element("strong", "mark-name", name),
        element("span", "mark-meaning", meaning),
      );
      marks.append(row);
    }

    const done = element("button", "start", "곡 고르기");
    done.type = "button";
    done.addEventListener("click", () => this.finish());

    const figure = element("div", "demo");
    figure.setAttribute("aria-hidden", "true");
    figure.append(this.canvas, this.now);
    this.judged.setAttribute("aria-live", "polite");
    options.root.append(
      element("h1", "menu-title", "하는 법"),
      figure,
      this.judged,
      element("p", "tutorial-rule", "크레파스 끝이 흰 고리에 닿는 순간 아무 키나 누르세요. 화면을 눌러도 됩니다."),
      marks,
      done,
    );
  }

  finish(): void {
    this.options.onDone();
  }

  /** Where the demo road is at `performanceMs`, in seconds from its first note: always within the shown lap. */
  private songTimeAt(performanceMs: number): number {
    const into = (performanceMs - this.startMs) / 1000 - DEMO_LEAD_S;
    return DEMO_LOOP_FROM_S + ((into % DEMO_PERIOD_S) + DEMO_PERIOD_S) % DEMO_PERIOD_S;
  }

  private draw(performanceMs: number): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) return;
    const ratio = window.devicePixelRatio;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = COLOR.background;
    ctx.fillRect(0, 0, width, height);
    const songTime = REDUCED_MOTION.matches ? DEMO_LOOP_FROM_S + STILL_AT_S : this.songTimeAt(performanceMs);
    drawRoadOnly(new Painter(ctx), demoFrame(songTime), { width, height });
    let lastNote = Number.NEGATIVE_INFINITY;
    for (const note of DEMO_TIMES) if (note <= songTime) lastNote = note;
    const sinceNote = songTime - lastNote;
    this.now.style.opacity = !REDUCED_MOTION.matches && sinceNote <= NOW_SHOWN_S ? "1" : "0";
  }

  private loop = (performanceMs: number): void => {
    this.draw(performanceMs);
    if (!REDUCED_MOTION.matches) this.frame = requestAnimationFrame(this.loop);
  };

  /**
   * A press at `performanceMs` while the demo plays, judged as the game judges a note: against the demo note
   * nearest to it, shown under the picture.
   */
  press(performanceMs: number): void {
    const songTime = this.songTimeAt(performanceMs);
    const nearest = DEMO_TIMES.reduce((best, note) => (Math.abs(note - songTime) < Math.abs(best - songTime) ? note : best));
    const offsetMs = (songTime - nearest) * 1000;
    const judgement = judgementOf(offsetMs / 1000) ?? "miss";
    const name = element("strong", "tutorial-judgement-name", judgement.toUpperCase());
    name.style.color = JUDGEMENT_COLOR[judgement];
    const off = Math.round(Math.abs(offsetMs));
    const side = off < EARLY_LATE_MIN_MS ? "" : `${offsetMs < 0 ? "빠름" : "느림"} ${off}ms`;
    this.judged.replaceChildren(name, element("span", "tutorial-judgement-offset", side));
    this.judged.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], {
      duration: JUDGEMENT_SHOWN_MS,
      fill: "forwards",
    });
  }

  show(): void {
    this.options.root.hidden = false;
    this.startMs = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.loop);
  }

  hide(): void {
    this.options.root.hidden = true;
    cancelAnimationFrame(this.frame);
  }
}
