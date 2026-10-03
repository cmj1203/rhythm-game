import { element } from "./dom";

export type TitleOptions = {
  readonly root: HTMLElement;
  readonly onStart: () => void;
};

const GAME_NAME = "라이브캔버스";

/** The words under the title. The title itself is drawn on the canvas behind them. */
export class TitleScreen {
  private readonly startButton: HTMLButtonElement;

  constructor(private readonly options: TitleOptions) {
    const start = element("button", "start", "시작");
    start.type = "button";
    start.addEventListener("click", () => this.start());
    this.startButton = start;
    options.root.append(
      element("h1", "title-name", GAME_NAME),
      element("p", "title-tagline", "키 하나로 그리는 리듬게임"),
      start,
      element("p", "hint", "Enter 시작"),
    );
  }

  /** The words stay out of sight, and the button out of reach, until the title is written. */
  setReady(isReady: boolean): void {
    this.options.root.classList.toggle("waiting", !isReady);
    this.startButton.disabled = !isReady;
  }

  start(): void {
    this.options.onStart();
  }

  show(): void {
    this.options.root.hidden = false;
  }

  hide(): void {
    this.options.root.hidden = true;
  }
}
