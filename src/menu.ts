import { DIFFICULTIES, type Difficulty, type SongSummary } from "./chart";
import { element } from "./dom";

export type MenuChoice = { readonly song: SongSummary; readonly difficulty: Difficulty };
export type MenuOptions = {
  readonly root: HTMLElement;
  readonly songs: readonly SongSummary[];
  readonly initialSongId: string | null;
  readonly onStart: (choice: MenuChoice) => void;
};

const DIFFICULTY_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard" } as const satisfies Record<Difficulty, string>;
const DIFFICULTY_BY_CODE: Readonly<Record<string, Difficulty>> = { Digit1: "easy", Digit2: "normal", Digit3: "hard" };

type DifficultyControl = { readonly button: HTMLButtonElement; readonly count: HTMLSpanElement };

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export class SongMenu {
  private songIndex: number;
  private difficulty: Difficulty = "normal";
  private readonly rows: readonly HTMLLIElement[];
  private readonly controls: ReadonlyMap<Difficulty, DifficultyControl>;
  private readonly credit = element("p", "credit");
  private readonly status = element("p", "status");

  constructor(private readonly options: MenuOptions) {
    const { root, songs, initialSongId } = options;
    this.songIndex = Math.max(
      0,
      songs.findIndex((song) => song.id === initialSongId),
    );

    const list = element("ul", "songs");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "곡 목록");
    this.rows = songs.map((song, index) => {
      const row = element("li", "song");
      row.setAttribute("role", "option");
      row.append(
        element("span", "song-title", song.title),
        element("span", "song-artist", song.artist ?? ""),
        element("span", "song-meta", `${Math.round(song.bpm)} BPM · ${formatDuration(song.duration)}`),
      );
      row.addEventListener("click", () => this.select(index));
      row.addEventListener("dblclick", () => this.start());
      return row;
    });
    list.append(...this.rows);

    const difficulties = element("div", "difficulties");
    difficulties.setAttribute("role", "radiogroup");
    difficulties.setAttribute("aria-label", "난이도");
    this.controls = new Map(
      DIFFICULTIES.map((difficulty) => {
        const button = element("button", "difficulty");
        const count = element("span", "difficulty-count");
        button.type = "button";
        button.setAttribute("role", "radio");
        button.append(element("span", "difficulty-name", DIFFICULTY_LABEL[difficulty]), count);
        button.addEventListener("click", () => this.setDifficulty(difficulty));
        difficulties.append(button);
        return [difficulty, { button, count }];
      }),
    );

    const startButton = element("button", "start", "시작");
    startButton.type = "button";
    startButton.addEventListener("click", () => this.start());
    this.status.setAttribute("aria-live", "polite");

    root.append(
      element("h1", "menu-title", "곡 선택"),
      songs.length === 0 ? element("p", "empty", "곡이 없습니다. README의 곡 추가 방법을 따라 넣어 주세요.") : list,
      difficulties,
      startButton,
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
    switch (event.code) {
      case "ArrowUp":
        this.select(this.songIndex - 1);
        break;
      case "ArrowDown":
        this.select(this.songIndex + 1);
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

  private select(index: number): void {
    this.songIndex = Math.min(this.options.songs.length - 1, Math.max(0, index));
    this.refresh();
  }

  private setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.refresh();
  }

  private shiftDifficulty(delta: number): void {
    const next = DIFFICULTIES[DIFFICULTIES.indexOf(this.difficulty) + delta];
    if (next !== undefined) this.setDifficulty(next);
  }

  private start(): void {
    const song = this.options.songs[this.songIndex];
    if (song !== undefined) this.options.onStart({ song, difficulty: this.difficulty });
  }

  private refresh(): void {
    const song = this.options.songs[this.songIndex];
    this.rows.forEach((row, index) => {
      row.setAttribute("aria-selected", String(index === this.songIndex));
    });
    this.rows[this.songIndex]?.scrollIntoView({ block: "nearest" });
    for (const [difficulty, { button, count }] of this.controls) {
      button.setAttribute("aria-checked", String(difficulty === this.difficulty));
      count.textContent = song === undefined ? "" : `노트 ${song.notes[difficulty]}개`;
    }
    this.credit.textContent = song?.credit ?? "";
  }
}
