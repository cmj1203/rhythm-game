import { element } from "./dom";
import { LANE_BY_CODE, LANES } from "./lanes";
import { laneColor } from "./stage-layout";

export type TitleOptions = {
  readonly root: HTMLElement;
  readonly onStart: () => void;
};

const GAME_NAME = "Rhythm Game";

export class TitleScreen {
  private readonly keys: readonly HTMLElement[];

  constructor(private readonly options: TitleOptions) {
    const keyRow = element("div", "keys");
    keyRow.setAttribute("aria-label", "연주 키");
    this.keys = LANES.map((lane, index) => {
      const key = element("span", lane.label.length > 1 ? "key key-wide" : "key", lane.label);
      key.style.setProperty("--lane-color", laneColor(index));
      return key;
    });
    keyRow.append(...this.keys);

    const start = element("button", "start", "시작");
    start.type = "button";
    start.addEventListener("click", () => options.onStart());

    options.root.append(
      element("h1", "title-name", GAME_NAME),
      element("p", "title-tagline", "내 노래로 즐기는 리듬게임"),
      keyRow,
      element("p", "hint", "이 다섯 키로 연주합니다. 눌러 보세요."),
      start,
      element("p", "hint", "Enter 시작"),
    );
  }

  show(): void {
    this.options.root.hidden = false;
  }

  hide(): void {
    this.options.root.hidden = true;
    for (const key of this.keys) delete key.dataset["held"];
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.code === "Enter") {
      // A focused button already turns Enter into its own click.
      if (!(event.target instanceof HTMLButtonElement)) this.options.onStart();
      return;
    }
    this.setHeld(event, true);
  }

  handleKeyUp(event: KeyboardEvent): void {
    this.setHeld(event, false);
  }

  private setHeld(event: KeyboardEvent, isHeld: boolean): void {
    const lane = LANE_BY_CODE.get(event.code);
    const key = lane === undefined ? undefined : this.keys[lane];
    if (key === undefined) return;
    event.preventDefault();
    if (isHeld) key.dataset["held"] = "true";
    else delete key.dataset["held"];
  }
}
