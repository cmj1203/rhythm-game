import { element } from "./dom";
import { loadPlaylog } from "./playlog";

/**
 * How long the export's address stays valid after the click: Firefox and Safari start a download only after the
 * click handler returns, and an address revoked by then downloads nothing.
 */
const DOWNLOAD_URL_LIFETIME_MS = 1000;

export type SettingsOptions = {
  readonly root: HTMLElement;
  /** The volume chosen so far, as a share of full volume, and what to do when the player changes it. */
  readonly volume: number;
  readonly onVolume: (share: number) => void;
  readonly lagMs: number;
  readonly onCalibrate: () => void;
  /** The player wants the lag the timing check kept forgotten, back to none. */
  readonly onResetLag: () => void;
  readonly onClose: () => void;
};

export class SettingsScreen {
  private readonly lag = element("span", "settings-value");
  private readonly resetLag = element("button", "start secondary", "박자 초기화");

  constructor(private readonly options: SettingsOptions) {
    const calibrate = element("button", "start secondary settings-calibrate");
    calibrate.type = "button";
    calibrate.append(
      element("span", "settings-name", "박자 맞추기"),
      this.lag,
      element("span", "settings-note", "기기에 맞게 박자를 조정할 수 있어요"),
    );
    calibrate.addEventListener("click", () => options.onCalibrate());
    this.resetLag.type = "button";
    this.resetLag.addEventListener("click", () => options.onResetLag());
    const exportLog = element("button", "start secondary", "기록 내보내기");
    exportLog.type = "button";
    exportLog.addEventListener("click", () => downloadPlaylog());
    const close = element("button", "start", "닫기");
    close.type = "button";
    close.addEventListener("click", () => options.onClose());
    this.setLag(options.lagMs);

    options.root.append(
      element("h1", "menu-title", "설정"),
      volumeSlider(options.volume, options.onVolume),
      calibrate,
      this.resetLag,
      exportLog,
      close,
    );
  }

  setLag(ms: number): void {
    this.lag.textContent = `${ms > 0 ? "+" : ""}${ms}ms`;
    this.resetLag.disabled = ms === 0;
  }

  show(): void {
    this.options.root.hidden = false;
  }

  hide(): void {
    this.options.root.hidden = true;
  }
}

/** Hands the plays this browser kept to the player as the file `livecanvas-playlog.json`. */
function downloadPlaylog(): void {
  const blob = new Blob([JSON.stringify(loadPlaylog())], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "livecanvas-playlog.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
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
