import type { SongPlayer } from "./audio";
import { element } from "./dom";

export type CalibrationOptions = {
  readonly root: HTMLElement;
  readonly player: SongPlayer;
  /** Called with the lag to keep, or with null when the player leaves without keeping one. */
  readonly onDone: (lagSeconds: number | null) => void;
};

const CLICK_GAP_S = 0.6;
/** Clicks played in one run. Any of them may be pressed, so a player need not know when counting starts. */
const CLICKS = 12;
/** Presses that make a run: the dots on screen, lit one by one in the order the presses come. */
const COUNTED_CLICKS = 8;
/** A press further than this from every click is a stray and is left out. */
const CATCH_S = 0.25;
const ENOUGH_PRESSES = 6;
/** First-guess cutoff for a stable run, to be validated on real devices. */
const MAX_MAD_S = 0.04;
const LAST_PRESS_WAIT_S = 0.8;
const MAX_LAG_S = 0.3;

/**
 * The timing check: clicks at a steady beat, pressed along with by ear. The middle of how late (or early) the
 * presses come is how much later than the browser reports this device plays sound, plus the player's own habit;
 * moving song time back by that much makes a press that sounds right count as on time.
 */
export class CalibrationScreen {
  private readonly dots: readonly HTMLElement[];
  private readonly result = element("p", "calibration-result");
  private readonly again = element("button", "start secondary", "다시");
  private readonly keep = element("button", "start", "확인");
  /** How late each click was pressed, by click; a click pressed twice keeps the first press. */
  private readonly presses = new Map<number, number>();
  private found: number | null = null;
  private finishTimer = 0;
  private running = false;

  constructor(private readonly options: CalibrationOptions) {
    const row = element("div", "calibration-dots");
    row.setAttribute("aria-hidden", "true");
    this.dots = Array.from({ length: COUNTED_CLICKS }, () => element("span", "calibration-dot"));
    row.append(...this.dots);

    const buttons = element("div", "calibration-buttons");
    for (const button of [this.again, this.keep]) button.type = "button";
    this.again.addEventListener("click", () => this.run());
    this.keep.addEventListener("click", () => {
      if (this.found !== null) this.leave(this.found);
    });
    buttons.append(this.again, this.keep);

    this.result.setAttribute("aria-live", "polite");
    options.root.append(
      element("h1", "menu-title", "박자 맞추기"),
      element("p", "tutorial-rule", "소리에 맞춰 누르세요"),
      row,
      this.result,
      buttons,
    );
  }

  /** Shows the screen and starts the clicks. Must be called from a user gesture, so that audio may start. */
  show(): void {
    this.options.root.hidden = false;
    this.run();
  }

  hide(): void {
    this.stop();
    this.options.root.hidden = true;
  }

  cancel(): void {
    this.leave(null);
  }

  press(performanceMs: number): void {
    if (!this.running) return;
    const at = this.options.player.heardTime(performanceMs);
    const click = Math.round(at / CLICK_GAP_S);
    const late = at - click * CLICK_GAP_S;
    if (click < 0 || click >= CLICKS || Math.abs(late) > CATCH_S || this.presses.has(click)) return;
    this.dots[this.presses.size]?.classList.add("pressed");
    this.presses.set(click, late);
    if (this.presses.size === COUNTED_CLICKS) this.finish();
  }

  private run(): void {
    this.stop();
    this.presses.clear();
    this.found = null;
    for (const dot of this.dots) dot.classList.remove("pressed");
    this.result.textContent = "";
    this.again.hidden = true;
    this.keep.hidden = true;
    const times = Array.from({ length: CLICKS }, (_, index) => index * CLICK_GAP_S);
    void this.options.player.unlock();
    this.options.player.startClicks(times);
    this.running = true;
    const lastClick = times[times.length - 1] ?? 0;
    this.finishTimer = window.setTimeout(() => this.finish(), (CLICK_GAP_S + lastClick + LAST_PRESS_WAIT_S) * 1000);
  }

  private finish(): void {
    this.stop();
    const lates = [...this.presses.values()].sort((a, b) => a - b);
    const middle = lates[lates.length >> 1];
    const mad =
      middle === undefined
        ? undefined
        : lates.map((late) => Math.abs(late - middle)).sort((a, b) => a - b)[lates.length >> 1];
    if (lates.length < ENOUGH_PRESSES || middle === undefined || mad === undefined || mad > MAX_MAD_S) {
      this.result.textContent = "다시 해 주세요";
      this.again.hidden = false;
      return;
    }
    this.found = Math.max(-MAX_LAG_S, Math.min(MAX_LAG_S, middle));
    const ms = Math.round(this.found * 1000);
    this.result.textContent = `${ms > 0 ? "+" : ""}${ms}ms`;
    this.again.hidden = false;
    this.keep.hidden = false;
  }

  private stop(): void {
    window.clearTimeout(this.finishTimer);
    this.running = false;
    this.options.player.stop();
  }

  private leave(lag: number | null): void {
    this.hide();
    this.options.onDone(lag);
  }
}
