import { element } from "./dom";

export type SettingsOptions = {
  readonly root: HTMLElement;
  /**
   * The volume chosen so far, as a share of full volume, and what to do when the player changes it. Null for no
   * volume slider at all, as on a phone, which has its own volume buttons.
   */
  readonly volume: number | null;
  readonly onVolume: (share: number) => void;
  readonly lagMs: number;
  readonly onCalibrate: () => void;
  readonly onClose: () => void;
};

export class SettingsScreen {
  private readonly lag = element("span", "settings-value");

  constructor(private readonly options: SettingsOptions) {
    const calibrate = element("button", "start secondary settings-calibrate");
    calibrate.type = "button";
    calibrate.append(element("span", "settings-name", "박자 맞추기"), this.lag);
    calibrate.addEventListener("click", () => options.onCalibrate());
    const close = element("button", "start", "닫기");
    close.type = "button";
    close.addEventListener("click", () => options.onClose());
    this.setLag(options.lagMs);

    options.root.append(
      element("h1", "menu-title", "설정"),
      ...(options.volume === null ? [] : [volumeSlider(options.volume, options.onVolume)]),
      calibrate,
      close,
    );
  }

  setLag(ms: number): void {
    this.lag.textContent = `${ms > 0 ? "+" : ""}${ms}ms`;
  }

  show(): void {
    this.options.root.hidden = false;
  }

  hide(): void {
    this.options.root.hidden = true;
  }
}

/** "음량", a slider from 0 to 100% starting at `share`, and the percentage it is at. */
function volumeSlider(share: number, onVolume: (share: number) => void): HTMLLabelElement {
  const volume = element("label", "volume");
  const slider = element("input", "volume-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(share * 100));
  const percent = element("span", "volume-value", `${slider.value}%`);
  slider.addEventListener("input", () => {
    percent.textContent = `${slider.value}%`;
    onVolume(Number(slider.value) / 100);
  });
  volume.append(element("span", "volume-name", "음량"), slider, percent);
  return volume;
}
