import { element } from "./dom";

export type TutorialOptions = {
  readonly root: HTMLElement;
  readonly onDone: () => void;
};

const MARKS = [
  { kind: "slow", name: "큰 하늘 점", meaning: "오래 기다리는 칸입니다. 크레파스가 천천히 돌고, 도는 원이 하늘색이 됩니다" },
  { kind: "twirl", name: "보라 고리", meaning: "이 칸에서 크레파스가 도는 방향이 바뀝니다" },
] as const;

/** A looping picture of the one move in the game: the crayon comes round and its point touches the ring. */
function demo(): HTMLElement {
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
  return figure;
}

export class TutorialScreen {
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

    options.root.append(
      element("h1", "menu-title", "하는 법"),
      demo(),
      element("p", "tutorial-rule", "크레파스 끝이 흰 고리에 닿는 순간 아무 키나 누르세요. 화면을 눌러도 됩니다. 늦거나 이르면 빨간 낙서가 남고, 한 번도 누르지 않고 지나가면 게임 오버입니다."),
      marks,
      done,
      element("p", "hint", "Enter 곡 고르기 · Esc 처음 화면"),
    );
  }

  finish(): void {
    this.options.onDone();
  }

  show(): void {
    this.options.root.hidden = false;
  }

  hide(): void {
    this.options.root.hidden = true;
  }
}
