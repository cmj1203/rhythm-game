import { assertNever } from "./assert";
import { SongPlayer } from "./audio";
import { type Difficulty, loadSong, loadSongIndex, SongLoadError, type SongSummary } from "./chart";
import { PlayState } from "./judge";
import { LANE_BY_CODE } from "./lanes";
import { type MenuChoice, SongMenu } from "./menu";
import { type Frame, Renderer } from "./render";
import type { Feedback } from "./stage";
import { BURST_S } from "./stage-effects";
import { TitleScreen } from "./title";

const RESULT_DELAY_S = 1;

type Session = { readonly song: SongSummary; readonly difficulty: Difficulty; readonly play: PlayState };
type Screen =
  | { readonly kind: "title" }
  | { readonly kind: "menu" }
  | { readonly kind: "loading" }
  | (Session & {
      readonly kind: "playing";
      readonly duration: number;
      readonly bursts: Feedback[];
      feedback: Feedback | null;
    })
  | (Session & { readonly kind: "result" });

class MissingElementError extends Error {
  constructor(readonly selector: string) {
    super(`element not found: ${selector}`);
    this.name = "MissingElementError";
  }
}

function requireElement<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new MissingElementError(selector);
  return found;
}

type PlayingScreen = Extract<Screen, { kind: "playing" }>;

function record(screen: PlayingScreen, feedback: Feedback): void {
  screen.feedback = feedback;
  if (feedback.lane !== null) screen.bursts.push(feedback);
}

async function boot(): Promise<void> {
  const renderer = new Renderer(requireElement<HTMLCanvasElement>("#game"));
  const player = new SongPlayer();
  const heldLanes = new Set<number>();
  let screen: Screen = { kind: "title" };

  const begin = async ({ song, difficulty }: MenuChoice): Promise<void> => {
    if (screen.kind !== "menu") return;
    screen = { kind: "loading" };
    menu.setStatus("불러오는 중...");
    const unlocked = player.unlock();
    try {
      const { chart, audio } = await loadSong(song.id);
      const buffer = await player.decode(audio);
      await unlocked;
      menu.hide();
      heldLanes.clear();
      player.start(buffer);
      screen = {
        kind: "playing",
        song,
        difficulty,
        play: new PlayState(chart.charts[difficulty]),
        duration: buffer.duration,
        bursts: [],
        feedback: null,
      };
    } catch (error) {
      screen = { kind: "menu" };
      if (error instanceof SongLoadError || error instanceof DOMException) {
        menu.setStatus(`불러오기 실패: ${error.message}`);
        return;
      }
      menu.setStatus("불러오기 실패");
      throw error;
    }
  };

  const menu = new SongMenu({
    root: requireElement<HTMLElement>("#menu"),
    songs: await loadSongIndex(),
    initialSongId: new URLSearchParams(window.location.search).get("song"),
    onStart: (choice) => void begin(choice),
  });

  const title = new TitleScreen({
    root: requireElement<HTMLElement>("#title"),
    onStart: () => {
      title.hide();
      menu.show();
      screen = { kind: "menu" };
    },
  });

  const backToMenu = (): void => {
    player.stop();
    screen = { kind: "menu" };
    menu.show();
  };

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    switch (screen.kind) {
      case "title":
        title.handleKeyDown(event);
        return;
      case "menu":
        if (event.code === "Escape") {
          menu.hide();
          title.show();
          screen = { kind: "title" };
          return;
        }
        menu.handleKey(event);
        return;
      case "loading":
        return;
      case "playing": {
        if (event.code === "Escape") {
          backToMenu();
          return;
        }
        const lane = LANE_BY_CODE.get(event.code);
        if (lane === undefined) return;
        event.preventDefault();
        heldLanes.add(lane);
        const songTime = player.songTime(event.timeStamp);
        const hit = screen.play.hit(lane, songTime);
        if (hit !== null) record(screen, { ...hit, at: songTime });
        return;
      }
      case "result":
        if (event.code === "Enter" || event.code === "Escape") backToMenu();
        return;
      default:
        assertNever(screen);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (screen.kind === "title") {
      title.handleKeyUp(event);
      return;
    }
    const lane = LANE_BY_CODE.get(event.code);
    if (lane === undefined) return;
    heldLanes.delete(lane);
    if (screen.kind !== "playing") return;
    const songTime = player.songTime(event.timeStamp);
    const released = screen.play.release(lane, songTime);
    if (released !== null) record(screen, { ...released, at: songTime });
  });

  window.addEventListener("click", () => {
    if (screen.kind === "result") backToMenu();
  });

  const nextFrame = (): Frame => {
    switch (screen.kind) {
      case "title":
      case "menu":
      case "loading":
        return { kind: "idle" };
      case "playing": {
        const songTime = player.songTime(performance.now());
        for (const event of screen.play.advance(songTime)) record(screen, { ...event, at: songTime });
        while (screen.bursts[0] !== undefined && songTime - screen.bursts[0].at > BURST_S) screen.bursts.shift();
        if (songTime > screen.duration + RESULT_DELAY_S) {
          player.stop();
          screen = { kind: "result", song: screen.song, difficulty: screen.difficulty, play: screen.play };
          return { kind: "result", play: screen.play, title: screen.song.title, difficulty: screen.difficulty };
        }
        return {
          kind: "playing",
          play: screen.play,
          songTime,
          duration: screen.duration,
          heldLanes,
          feedback: screen.feedback,
          bursts: screen.bursts,
        };
      }
      case "result":
        return { kind: "result", play: screen.play, title: screen.song.title, difficulty: screen.difficulty };
      default:
        return assertNever(screen);
    }
  };

  const tick = (): void => {
    renderer.draw(nextFrame());
    requestAnimationFrame(tick);
  };
  tick();
}

boot().catch((error: unknown) => {
  document.body.textContent = error instanceof Error ? `불러오기 실패: ${error.message}` : "불러오기 실패";
  throw error;
});
