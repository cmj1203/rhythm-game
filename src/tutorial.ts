import { COLOR, JUDGEMENT_COLOR, Painter } from "./canvas";
import { element } from "./dom";
import { PracticeRoad } from "./practice-road";
import { BURST_S, drawRoadOnly, EARLY_LATE_MIN_MS } from "./track";

export type TutorialOptions = {
  readonly root: HTMLElement;
  readonly onDone: () => void;
  readonly onSettings: () => void;
};

/** How long a judgement made on the demo stays up, fading out over the last part of it. */
const JUDGEMENT_SHOWN_MS = 1200;

/** "지금!" shows for this long from each moment the crayon's point touches the next ring. */
const NOW_SHOWN_S = 0.18;
/** The still picture shown instead of the moving one to someone who asked for less motion. */
const STILL_AT_S = 0.6;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

export class TutorialScreen {
  private readonly canvas = element("canvas", "demo-road");
  private readonly now = element("span", "demo-now", "지금!");
  private readonly judged = element("p", "tutorial-judgement");
  private practice = new PracticeRoad(BURST_S);
  private startMs = 0;
  private frame = 0;

  constructor(private readonly options: TutorialOptions) {
    const done = element("button", "start", "곡 고르기");
    done.type = "button";
    done.addEventListener("click", () => this.finish());
    const settingsButton = element("button", "start secondary", "설정");
    settingsButton.type = "button";
    settingsButton.addEventListener("click", () => options.onSettings());

    const figure = element("div", "demo");
    figure.setAttribute("aria-hidden", "true");
    figure.append(this.canvas, this.now);
    this.judged.setAttribute("aria-live", "polite");
    options.root.append(
      element("h1", "menu-title", "하는 법"),
      figure,
      this.judged,
      done,
      settingsButton,
    );
  }

  finish(): void {
    this.options.onDone();
  }

  /** The practice road's song time at `performanceMs`. */
  private songTimeAt(performanceMs: number): number {
    return this.practice.songTimeAt((performanceMs - this.startMs) / 1000);
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
    const songTime = REDUCED_MOTION.matches ? this.practice.songTimeAt(STILL_AT_S) : this.songTimeAt(performanceMs);
    drawRoadOnly(new Painter(ctx), this.practice.frameAt(songTime), { width, height });
    this.now.style.opacity = !REDUCED_MOTION.matches && this.practice.touchedWithin(songTime, NOW_SHOWN_S) ? "1" : "0";
  }

  private loop = (performanceMs: number): void => {
    this.draw(performanceMs);
    if (!REDUCED_MOTION.matches) this.frame = requestAnimationFrame(this.loop);
  };

  /**
   * A press at `performanceMs`, judged as the game judges a note against the moment the crayon's point touches the
   * next ring: a hit steps the crayon on, a miss leaves it turning where it is. The judgement shows under the picture.
   */
  press(performanceMs: number): void {
    const { judgement, offsetS } = this.practice.press(this.songTimeAt(performanceMs));
    const offsetMs = offsetS * 1000;
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
    this.practice = new PracticeRoad(BURST_S);
    this.startMs = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.loop);
  }

  hide(): void {
    this.options.root.hidden = true;
    cancelAnimationFrame(this.frame);
  }
}
