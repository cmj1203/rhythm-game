import { JUDGEMENT_COLOR } from "./canvas";
import { element } from "./dom";
import { judgementOf } from "./judge";
import { EARLY_LATE_MIN_MS } from "./track";

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

/** A looping picture of the one move in the game: the crayon comes round and its point touches the ring. */
function demo(): { readonly figure: HTMLElement; readonly hand: HTMLElement } {
  const figure = element("div", "demo");
  figure.setAttribute("aria-hidden", "true");
  const hand = element("span", "demo-hand");
  hand.append(element("span", "demo-crayon"));
  figure.append(
    element("span", "demo-orbit"),
    element("span", "demo-road"),
    element("span", "demo-target"),
    hand,
    element("span", "demo-stitch"),
    element("span", "demo-now", "지금!"),
  );
  return { figure, hand };
}

export class TutorialScreen {
  private readonly hand: HTMLElement;
  private readonly judged = element("p", "tutorial-judgement");

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

    const { figure, hand } = demo();
    this.hand = hand;
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

  /**
   * A press at `performanceMs` while the demo turns, judged as the game judges a note: against the moment the
   * crayon's point touches the ring nearest to it (the start of each turn), shown under the picture.
   */
  press(performanceMs: number): void {
    const turn = this.hand.getAnimations()[0];
    const period = Number(turn?.effect?.getTiming().duration);
    if (turn === undefined || turn.startTime === null || !(period > 0)) return;
    const into = (((performanceMs - Number(turn.startTime)) % period) + period) % period;
    const offsetMs = into < period / 2 ? into : into - period;
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
  }

  hide(): void {
    this.options.root.hidden = true;
  }
}
