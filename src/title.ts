import { element } from "./dom";

export type TitleOptions = {
  readonly root: HTMLElement;
  readonly onStart: () => void;
};

const GAME_NAME = "Rhythm Game";

export class TitleScreen {
  constructor(private readonly options: TitleOptions) {
    const start = element("button", "start", "시작");
    start.type = "button";
    start.addEventListener("click", () => this.start());

    options.root.append(
      element("h1", "title-name", GAME_NAME),
      element("p", "title-tagline", "키 하나로 즐기는 리듬게임"),
      start,
      element("p", "hint", "Enter 시작"),
    );
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
