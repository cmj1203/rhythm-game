import { assertNever } from "./assert";
import { decodingShift, LEAD_IN_S, SongPlayer } from "./audio";
import { type Difficulty, loadSong, loadSongIndex, SongLoadError, type SongSummary } from "./chart";
import { DrawingLoadError } from "./drawing";
import { loadIntro } from "./intro";
import { PlayState } from "./judge";
import { type MenuChoice, SongMenu } from "./menu";
import type { Path } from "./path";
import { sewingFor } from "./pictures";
import { type Frame, Renderer } from "./render";
import { dyePath, planSections, type Section } from "./sections";
import { TitleScreen } from "./title";
import { BURST_S, type Feedback, finaleProgress } from "./track";
import { TutorialScreen } from "./tutorial";

const RESULT_FADE_MS = 600;

type Session = {
  readonly song: SongSummary;
  readonly difficulty: Difficulty;
  readonly pictureName: string;
  readonly sections: readonly Section[];
  readonly play: PlayState;
};
type Screen =
  | { readonly kind: "title" }
  | { readonly kind: "tutorial" }
  | { readonly kind: "menu" }
  | { readonly kind: "loading" }
  | (Session & {
      readonly kind: "ready";
      readonly path: Path;
      readonly buffer: AudioBuffer;
      readonly audioShift: number;
    })
  | (Session & {
      readonly kind: "playing";
      readonly path: Path;
      readonly duration: number;
      readonly bursts: Feedback[];
      feedback: Feedback | null;
    })
  | (Session & { readonly kind: "result"; readonly path: Path; readonly shownAt: number });

type ReadyScreen = Extract<Screen, { kind: "ready" }>;
type PlayingScreen = Extract<Screen, { kind: "playing" }>;

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

function record(screen: PlayingScreen, feedback: Feedback): void {
  screen.feedback = feedback;
  if (feedback.judgement !== "miss") screen.bursts.push(feedback);
}

async function boot(): Promise<void> {
  const renderer = new Renderer(requireElement<HTMLCanvasElement>("#game"));
  const player = new SongPlayer();
  const songs = await loadSongIndex();
  const intro = await loadIntro({
    isCalm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    onReady: () => title.setReady(true),
  });
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
      const times = chart.charts[difficulty];
      const { pictureName, path } = await sewingFor(
        times,
        songs.findIndex(({ id }) => id === song.id),
        songs.length,
        difficulty,
      );
      const sections = planSections(times, chart.bpm, chart.offset);
      menu.hide();
      screen = {
        kind: "ready",
        song,
        difficulty,
        pictureName,
        sections,
        play: new PlayState(times),
        path: dyePath(path, sections),
        buffer,
        audioShift: decodingShift(buffer, chart.anchors),
      };
    } catch (error) {
      screen = { kind: "menu" };
      if (error instanceof SongLoadError || error instanceof DrawingLoadError || error instanceof DOMException) {
        menu.setStatus(`불러오기 실패: ${error.message}`);
        return;
      }
      menu.setStatus("불러오기 실패");
      throw error;
    }
  };

  const menu = new SongMenu({
    root: requireElement<HTMLElement>("#menu"),
    songs,
    initialSongId: new URLSearchParams(window.location.search).get("song"),
    onStart: (choice) => void begin(choice),
  });

  const tutorial = new TutorialScreen({
    root: requireElement<HTMLElement>("#tutorial"),
    onDone: () => {
      tutorial.hide();
      menu.show();
      screen = { kind: "menu" };
    },
  });

  const title = new TitleScreen({
    root: requireElement<HTMLElement>("#title"),
    onStart: () => {
      title.hide();
      tutorial.show();
      screen = { kind: "tutorial" };
    },
  });
  title.setReady(intro.isOver);

  const backToMenu = (): void => {
    player.stop();
    screen = { kind: "menu" };
    menu.show();
  };

  const startPlaying = (ready: ReadyScreen): void => {
    player.start(ready.buffer, ready.audioShift);
    screen = {
      kind: "playing",
      song: ready.song,
      difficulty: ready.difficulty,
      pictureName: ready.pictureName,
      sections: ready.sections,
      play: ready.play,
      path: ready.path,
      duration: ready.buffer.duration,
      bursts: [],
      feedback: null,
    };
  };

  const press = (playing: PlayingScreen, performanceMs: number): void => {
    const songTime = player.songTime(performanceMs);
    const hit = playing.play.press(songTime);
    if (hit !== null) record(playing, { ...hit, at: songTime });
  };

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    switch (screen.kind) {
      case "title":
        if (intro.isOver) {
          if (event.code === "Enter" && !(event.target instanceof HTMLButtonElement)) title.start();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        intro.skip();
        return;
      case "tutorial":
        if (event.code === "Escape") {
          tutorial.hide();
          title.show();
          screen = { kind: "title" };
          return;
        }
        if (event.code === "Enter" && !(event.target instanceof HTMLButtonElement)) tutorial.finish();
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
      case "ready":
        if (event.code === "Escape") {
          backToMenu();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        startPlaying(screen);
        return;
      case "playing":
        if (event.code === "Escape") {
          backToMenu();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        press(screen, event.timeStamp);
        return;
      case "result":
        if (event.code === "Enter" || event.code === "Escape") backToMenu();
        return;
      default:
        assertNever(screen);
    }
  });

  window.addEventListener("pointerdown", (event) => {
    if (screen.kind === "title") intro.skip();
    else if (screen.kind === "ready") startPlaying(screen);
    else if (screen.kind === "playing") press(screen, event.timeStamp);
  });

  window.addEventListener("click", () => {
    if (screen.kind === "result") backToMenu();
  });

  const nextFrame = (): Frame => {
    switch (screen.kind) {
      case "title":
        return intro.advance(performance.now());
      case "tutorial":
      case "menu":
      case "loading":
        return { kind: "idle" };
      case "ready":
        return {
          kind: "playing",
          phase: "ready",
          play: screen.play,
          path: screen.path,
          sections: screen.sections,
          songTime: -LEAD_IN_S,
          duration: screen.buffer.duration,
          feedback: null,
          bursts: [],
        };
      case "playing": {
        const songTime = player.songTime(performance.now());
        for (const event of screen.play.advance(songTime)) record(screen, { ...event, at: songTime });
        while (screen.bursts[0] !== undefined && songTime - screen.bursts[0].at > BURST_S) screen.bursts.shift();
        // The song may still be playing its outro here; it keeps going under the result screen.
        if (finaleProgress(screen.path, songTime) >= 1) {
          screen = {
            kind: "result",
            song: screen.song,
            difficulty: screen.difficulty,
            pictureName: screen.pictureName,
            sections: screen.sections,
            play: screen.play,
            path: screen.path,
            shownAt: performance.now(),
          };
          return nextFrame();
        }
        return {
          kind: "playing",
          phase: "playing",
          play: screen.play,
          path: screen.path,
          sections: screen.sections,
          songTime,
          duration: screen.duration,
          feedback: screen.feedback,
          bursts: screen.bursts,
        };
      }
      case "result":
        return {
          kind: "result",
          play: screen.play,
          path: screen.path,
          pictureName: screen.pictureName,
          title: screen.song.title,
          difficulty: screen.difficulty,
          fade: Math.min(1, (performance.now() - screen.shownAt) / RESULT_FADE_MS),
        };
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
