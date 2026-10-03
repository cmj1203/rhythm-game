import { DIFFICULTIES, type Difficulty, type SongSummary } from "./chart";
import { element } from "./dom";

export type MenuOptions = {
  readonly root: HTMLElement;
  readonly songs: readonly SongSummary[];
  readonly initialSongId: string | null;
  readonly onStart: (song: SongSummary) => void;
  /** The volume chosen so far, as a share of full volume, and what to do when the player changes it. */
  readonly volume: number;
  readonly onVolume: (share: number) => void;
};

const DIFFICULTY_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard" } as const satisfies Record<Difficulty, string>;
const DIFFICULTY_BY_CODE: Readonly<Record<string, Difficulty>> = { Digit1: "easy", Digit2: "normal", Digit3: "hard" };

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Every song has one difficulty. The list shows the songs of one difficulty at a time: that of the song picked. */
export class SongMenu {
  private songIndex: number;
  /** The difficulties that have songs, easiest first. */
  private readonly difficulties: readonly Difficulty[];
  private readonly rows: readonly HTMLLIElement[];
  private readonly tabs: ReadonlyMap<Difficulty, HTMLButtonElement>;
  private readonly credit = element("p", "credit");
  private readonly status = element("p", "status");

  constructor(private readonly options: MenuOptions) {
    const { root, songs, initialSongId } = options;
    this.difficulties = DIFFICULTIES.filter((difficulty) => songs.some((song) => song.difficulty === difficulty));
    const asked = songs.findIndex((song) => song.id === initialSongId);
    this.songIndex = asked >= 0 ? asked : Math.max(0, this.firstOf(this.difficulties[0]));

    const tabs = element("div", "difficulties");
    tabs.setAttribute("role", "radiogroup");
    tabs.setAttribute("aria-label", "난이도");
    this.tabs = new Map(
      this.difficulties.map((difficulty) => {
        const tab = element("button", "difficulty");
        const count = songs.filter((song) => song.difficulty === difficulty).length;
        tab.type = "button";
        tab.setAttribute("role", "radio");
        tab.append(
          element("span", "difficulty-name", DIFFICULTY_LABEL[difficulty]),
          element("span", "difficulty-count", `${count}곡`),
        );
        tab.addEventListener("click", () => this.setDifficulty(difficulty));
        tabs.append(tab);
        return [difficulty, tab];
      }),
    );

    const list = element("ul", "songs");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "곡 목록");
    this.rows = songs.map((song, index) => {
      const row = element("li", "song");
      const noteCount = `노트 ${song.notes}개`;
      row.setAttribute("role", "option");
      row.append(
        element("span", "song-title", song.title),
        element("span", "song-artist", song.artist === undefined ? noteCount : `${song.artist} · ${noteCount}`),
        element("span", "song-meta", `${Math.round(song.bpm)} BPM · ${formatDuration(song.duration)}`),
      );
      row.addEventListener("click", () => this.select(index));
      row.addEventListener("dblclick", () => this.start());
      return row;
    });
    list.append(...this.rows);

    const startButton = element("button", "start", "시작");
    startButton.type = "button";
    startButton.addEventListener("click", () => this.start());
    this.status.setAttribute("aria-live", "polite");

    const volume = element("label", "volume");
    const slider = element("input", "volume-slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "5";
    slider.value = String(Math.round(options.volume * 100));
    const percent = element("span", "volume-value", `${slider.value}%`);
    slider.addEventListener("input", () => {
      percent.textContent = `${slider.value}%`;
      options.onVolume(Number(slider.value) / 100);
    });
    volume.append(element("span", "volume-name", "음량"), slider, percent);

    root.append(
      element("h1", "menu-title", "곡 선택"),
      tabs,
      songs.length === 0 ? element("p", "empty", "곡이 없습니다. README의 곡 추가 방법을 따라 넣어 주세요.") : list,
      startButton,
      volume,
      this.status,
      element("p", "hint", "↑↓ 곡 선택 · ←→ 난이도 · Enter 시작 · Esc 처음 화면"),
      this.credit,
    );
    this.refresh();
  }

  show(): void {
    this.options.root.hidden = false;
    this.setStatus("");
  }

  hide(): void {
    this.options.root.hidden = true;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  handleKey(event: KeyboardEvent): void {
    // The volume slider takes the arrow keys for itself while it has the focus.
    if (event.target instanceof HTMLInputElement) return;
    switch (event.code) {
      case "ArrowUp":
        this.step(-1);
        break;
      case "ArrowDown":
        this.step(1);
        break;
      case "ArrowLeft":
        this.shiftDifficulty(-1);
        break;
      case "ArrowRight":
        this.shiftDifficulty(1);
        break;
      case "Enter":
        // A focused button already turns Enter into its own click.
        if (event.target instanceof HTMLButtonElement) return;
        this.start();
        break;
      default: {
        const difficulty = DIFFICULTY_BY_CODE[event.code];
        if (difficulty === undefined) return;
        this.setDifficulty(difficulty);
      }
    }
    event.preventDefault();
  }

  /** The place in the list of the first song of `difficulty`, or -1 if there is none. */
  private firstOf(difficulty: Difficulty | undefined): number {
    return this.options.songs.findIndex((song) => song.difficulty === difficulty);
  }

  private select(index: number): void {
    this.songIndex = index;
    this.refresh();
  }

  /** Picks the next song of the difficulty on show: `by` 1 goes down the list, -1 up. */
  private step(by: 1 | -1): void {
    const { songs } = this.options;
    const difficulty = songs[this.songIndex]?.difficulty;
    for (let index = this.songIndex + by; songs[index] !== undefined; index += by) {
      if (songs[index]?.difficulty === difficulty) {
        this.select(index);
        return;
      }
    }
  }

  /** Shows the songs of `difficulty`, with the first of them picked. */
  private setDifficulty(difficulty: Difficulty): void {
    const first = this.firstOf(difficulty);
    if (first >= 0 && this.options.songs[this.songIndex]?.difficulty !== difficulty) this.select(first);
  }

  private shiftDifficulty(delta: number): void {
    const shown = this.options.songs[this.songIndex]?.difficulty;
    if (shown === undefined) return;
    const next = this.difficulties[this.difficulties.indexOf(shown) + delta];
    if (next !== undefined) this.setDifficulty(next);
  }

  private start(): void {
    const song = this.options.songs[this.songIndex];
    if (song !== undefined) this.options.onStart(song);
  }

  private refresh(): void {
    const { songs } = this.options;
    const song = songs[this.songIndex];
    this.rows.forEach((row, index) => {
      row.hidden = songs[index]?.difficulty !== song?.difficulty;
      row.setAttribute("aria-selected", String(index === this.songIndex));
    });
    this.rows[this.songIndex]?.scrollIntoView({ block: "nearest" });
    for (const [difficulty, tab] of this.tabs) {
      tab.setAttribute("aria-checked", String(difficulty === song?.difficulty));
    }
    this.credit.textContent = song?.credit ?? "";
  }
}
