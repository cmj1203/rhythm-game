import { loadBests } from "./best";
import { DIFFICULTIES, type Difficulty, type SongSummary } from "./chart";
import { element } from "./dom";

export type MenuOptions = {
  readonly root: HTMLElement;
  readonly songs: readonly SongSummary[];
  readonly initialSongId: string | null;
  readonly onStart: (song: SongSummary) => void;
  readonly onSettings: () => void;
  /** The player picked `song` in the list, by clicking it, the arrow keys or a difficulty tab. */
  readonly onBrowse: (song: SongSummary) => void;
};

/** A tab of the list: the songs made for this game (artist LiveCanvas) on their own, the rest by difficulty. */
type Shelf = "new" | Difficulty;
const SHELVES: readonly Shelf[] = ["new", ...DIFFICULTIES];
const SHELF_LABEL = { new: "New", easy: "Easy", normal: "Normal", hard: "Hard" } as const satisfies Record<Shelf, string>;

function shelfOf(song: SongSummary | undefined): Shelf | undefined {
  return song?.artist === "LiveCanvas" ? "new" : song?.difficulty;
}
const DIFFICULTY_BY_CODE: Readonly<Record<string, Difficulty>> = { Digit1: "easy", Digit2: "normal", Digit3: "hard" };

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Every song has one shelf. The list shows the songs of one shelf at a time: that of the song picked. */
export class SongMenu {
  private songIndex: number;
  /** The shelves that have songs, the new songs first, then easiest first. */
  private readonly shelves: readonly Shelf[];
  private readonly rows: readonly HTMLLIElement[];
  /** Each row's place for the song's best on this device. */
  private readonly bestLabels: readonly HTMLElement[];
  private readonly tabs: ReadonlyMap<Shelf, HTMLButtonElement>;
  private readonly credit = element("p", "credit");
  private readonly status = element("p", "status");

  constructor(private readonly options: MenuOptions) {
    const { root, songs, initialSongId } = options;
    this.shelves = SHELVES.filter((shelf) => songs.some((song) => shelfOf(song) === shelf));
    const asked = songs.findIndex((song) => song.id === initialSongId);
    this.songIndex = asked >= 0 ? asked : Math.max(0, this.firstOf(this.shelves[0]));

    const tabs = element("div", "difficulties");
    tabs.setAttribute("role", "radiogroup");
    tabs.setAttribute("aria-label", "난이도");
    this.tabs = new Map(
      this.shelves.map((shelf) => {
        const tab = element("button", "difficulty");
        const count = songs.filter((song) => shelfOf(song) === shelf).length;
        tab.type = "button";
        tab.setAttribute("role", "radio");
        tab.append(
          element("span", "difficulty-name", SHELF_LABEL[shelf]),
          element("span", "difficulty-count", `${count}곡`),
        );
        tab.addEventListener("click", () => this.setShelf(shelf));
        tabs.append(tab);
        return [shelf, tab];
      }),
    );

    const list = element("ul", "songs");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "곡 목록");
    const bestLabels: HTMLElement[] = [];
    this.rows = songs.map((song, index) => {
      const row = element("li", "song");
      const noteCount = `노트 ${song.notes}개`;
      const best = element("span", "song-best");
      bestLabels.push(best);
      const meta = element("span", "song-meta", `${Math.round(song.bpm)} BPM · ${formatDuration(song.duration)}`);
      meta.append(best);
      row.setAttribute("role", "option");
      row.append(
        element("span", "song-title", song.title),
        element("span", "song-artist", song.artist === undefined ? noteCount : `${song.artist} · ${noteCount}`),
        meta,
      );
      row.addEventListener("click", () => this.select(index));
      row.addEventListener("dblclick", () => this.start());
      return row;
    });
    this.bestLabels = bestLabels;
    list.append(...this.rows);

    const startButton = element("button", "start", "시작");
    startButton.type = "button";
    startButton.addEventListener("click", () => this.start());
    const settingsButton = element("button", "start secondary", "설정");
    settingsButton.type = "button";
    settingsButton.addEventListener("click", () => options.onSettings());
    this.status.setAttribute("aria-live", "polite");

    root.append(
      element("h1", "menu-title", "곡 선택"),
      tabs,
      songs.length === 0 ? element("p", "empty", "곡이 없습니다. README의 곡 추가 방법을 따라 넣어 주세요.") : list,
      startButton,
      settingsButton,
      this.status,
      this.credit,
    );
    this.showBests();
    this.refresh();
  }

  show(): void {
    this.options.root.hidden = false;
    this.setStatus("");
    this.showBests();
  }

  hide(): void {
    this.options.root.hidden = true;
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  handleKey(event: KeyboardEvent): void {
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
        this.setShelf(difficulty);
      }
    }
    event.preventDefault();
  }

  private showBests(): void {
    const bests = loadBests();
    this.options.songs.forEach((song, index) => {
      const best = bests.get(song.id);
      const label = this.bestLabels[index];
      if (label !== undefined) label.textContent = best === undefined ? "" : `최고 ${best.grade}점`;
    });
  }

  /** The place in the list of the first song of `shelf`, or -1 if there is none. */
  private firstOf(shelf: Shelf | undefined): number {
    return this.options.songs.findIndex((song) => shelfOf(song) === shelf);
  }

  private select(index: number): void {
    this.songIndex = index;
    this.refresh();
    const song = this.options.songs[index];
    if (song !== undefined) this.options.onBrowse(song);
  }

  /** Picks the next song of the shelf on show: `by` 1 goes down the list, -1 up. */
  private step(by: 1 | -1): void {
    const { songs } = this.options;
    const shelf = shelfOf(songs[this.songIndex]);
    for (let index = this.songIndex + by; songs[index] !== undefined; index += by) {
      if (shelfOf(songs[index]) === shelf) {
        this.select(index);
        return;
      }
    }
  }

  /** Shows the songs of `shelf`, with the first of them picked. */
  private setShelf(shelf: Shelf): void {
    const first = this.firstOf(shelf);
    if (first >= 0 && shelfOf(this.options.songs[this.songIndex]) !== shelf) this.select(first);
  }

  private shiftDifficulty(delta: number): void {
    const shown = shelfOf(this.options.songs[this.songIndex]);
    if (shown === undefined) return;
    const next = this.shelves[this.shelves.indexOf(shown) + delta];
    if (next !== undefined) this.setShelf(next);
  }

  private start(): void {
    const song = this.options.songs[this.songIndex];
    if (song !== undefined) this.options.onStart(song);
  }

  private refresh(): void {
    const { songs } = this.options;
    const song = songs[this.songIndex];
    this.rows.forEach((row, index) => {
      row.hidden = shelfOf(songs[index]) !== shelfOf(song);
      row.setAttribute("aria-selected", String(index === this.songIndex));
    });
    this.rows[this.songIndex]?.scrollIntoView({ block: "nearest" });
    for (const [shelf, tab] of this.tabs) {
      tab.setAttribute("aria-checked", String(shelf === shelfOf(song)));
    }
    this.credit.textContent = song?.credit ?? "";
  }
}
