import { assertNever } from "./assert";
import { countIn, decodingShift, LEAD_IN_S, SongPlayer, volumeFor } from "./audio";
import { recordBest } from "./best";
import { CalibrationScreen } from "./calibration";
import { SettingsScreen } from "./settings";
import {
  type Difficulty,
  inMenuOrder,
  loadPicturePins,
  loadSong,
  loadSongIndex,
  SongLoadError,
  type SongSummary,
} from "./chart";
import { element } from "./dom";
import { DrawingLoadError } from "./drawing";
import { loadIntro } from "./intro";
import { PlayState } from "./judge";
import { SongMenu } from "./menu";
import type { Path } from "./path";
import { sewingFor, sewingOf } from "./pictures";
import { type Frame, Renderer } from "./render";
import { resultButtonsAt } from "./result-screen";
import { dyePath, planSections, type Section } from "./sections";
import { TitleScreen } from "./title";
import { BURST_S, type Feedback, finaleProgress } from "./track";
import { TutorialScreen } from "./tutorial";

const RESULT_FADE_MS = 600;
/** A song is previewed once the player has stayed on it this long, so that running down the list stays quiet. */
const PREVIEW_DELAY_MS = 350;

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
  | { readonly kind: "settings" }
  | { readonly kind: "calibration" }
  | { readonly kind: "loading" }
  | ReadyScreen
  | (Session & {
      readonly kind: "playing";
      readonly path: Path;
      readonly duration: number;
      readonly bursts: Feedback[];
      /** The screen the play began from, for starting the song again after a game over. */
      readonly source: ReadyScreen;
      feedback: Feedback | null;
    })
  | (Session & {
      readonly kind: "result";
      readonly path: Path;
      readonly shownAt: number;
      readonly source: ReadyScreen;
      readonly bestGrade: number;
      readonly isNewBest: boolean;
      readonly previousBestGrade: number | null;
    })
  | (Session & { readonly kind: "over"; readonly path: Path; readonly at: number; readonly source: ReadyScreen });

type ReadyScreen = Session & {
  readonly kind: "ready";
  readonly path: Path;
  readonly buffer: AudioBuffer;
  readonly audioShift: number;
  readonly volume: number;
  /** Song times of the clicks that count the beat in before the first note. */
  readonly countIn: readonly number[];
};
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

const VOLUME_KEY = "livecanvas.volume";

/** The volume the player chose last time, as a share of full volume; full volume if none was saved. */
function savedVolume(): number {
  const saved = Number(localStorage.getItem(VOLUME_KEY) ?? "1");
  return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 1;
}

const LAG_KEY = "livecanvas.lagMs";

/** The lag the timing check found last time, in seconds; none if it was never kept. */
function savedLag(): number {
  const saved = Number(localStorage.getItem(LAG_KEY) ?? "0");
  return Number.isFinite(saved) ? saved / 1000 : 0;
}

async function boot(): Promise<void> {
  const renderer = new Renderer(requireElement<HTMLCanvasElement>("#game"));
  const overButtons = requireElement<HTMLElement>("#over");
  const backCorner = requireElement<HTMLElement>("#back");
  const player = new SongPlayer();
  // A phone has its own volume buttons, so it gets no slider, and plays at the game's own level.
  const hasVolumeSlider = !window.matchMedia("(pointer: coarse)").matches;
  const volume = hasVolumeSlider ? savedVolume() : 1;
  player.setVolume(volume);
  player.setLag(savedLag());
  const songs = await loadSongIndex();
  const picturePins = await loadPicturePins();
  const query = new URLSearchParams(window.location.search);
  const intro = await loadIntro({
    isCalm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    onReady: () => title.setReady(true),
  });
  let screen: Screen = { kind: "title" };

  let previewTimer = 0;
  let previewing: string | null = null;
  const stopPreview = (): void => {
    window.clearTimeout(previewTimer);
    previewing = null;
    player.stop();
  };
  const playPreview = async (songId: string): Promise<void> => {
    let buffer: AudioBuffer;
    try {
      buffer = await player.decode((await loadSong(songId)).audio);
    } catch (error) {
      // A preview that cannot load stays silent: starting the song reports the same failure.
      if (error instanceof SongLoadError || error instanceof DOMException) return;
      throw error;
    }
    if (previewing === songId && screen.kind === "menu") player.preview(buffer, volumeFor(buffer));
  };
  const previewSong = (song: SongSummary): void => {
    stopPreview();
    previewing = song.id;
    void player.unlock();
    previewTimer = window.setTimeout(() => void playPreview(song.id), PREVIEW_DELAY_MS);
  };

  const begin = async (song: SongSummary): Promise<void> => {
    if (screen.kind !== "menu") return;
    stopPreview();
    screen = { kind: "loading" };
    menu.setStatus("불러오는 중...");
    const unlocked = player.unlock();
    try {
      const { chart, audio } = await loadSong(song.id);
      const buffer = await player.decode(audio);
      await unlocked;
      const times = chart.notes;
      const pinned = picturePins.get(song.id);
      const { pictureName, path } =
        pinned === undefined
          ? await sewingFor(
              times,
              songs.findIndex(({ id }) => id === song.id),
              songs.length,
              song.difficulty,
            )
          : await sewingOf(times, pinned);
      const sections = planSections(times, chart.bpm, chart.offset);
      menu.hide();
      backCorner.hidden = false;
      screen = {
        kind: "ready",
        song,
        difficulty: song.difficulty,
        pictureName,
        sections,
        play: new PlayState(times),
        path: dyePath(path, sections),
        buffer,
        audioShift: decodingShift(buffer, chart.anchors),
        volume: volumeFor(buffer),
        countIn: countIn(chart.bpm, times),
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
    songs: await inMenuOrder(songs),
    initialSongId: query.get("song"),
    onStart: (song) => void begin(song),
    onSettings: () => {
      stopPreview();
      menu.hide();
      settings.show();
      screen = { kind: "settings" };
    },
    onBrowse: previewSong,
  });

  const settings = new SettingsScreen({
    root: requireElement<HTMLElement>("#settings"),
    volume: hasVolumeSlider ? volume : null,
    onVolume: (share) => {
      player.setVolume(share);
      localStorage.setItem(VOLUME_KEY, String(share));
    },
    lagMs: Math.round(savedLag() * 1000),
    onCalibrate: () => {
      settings.hide();
      calibration.show();
      screen = { kind: "calibration" };
    },
    onClose: () => {
      settings.hide();
      menu.show();
      screen = { kind: "menu" };
    },
  });

  const calibration = new CalibrationScreen({
    root: requireElement<HTMLElement>("#calibration"),
    player,
    onDone: (lag) => {
      if (lag !== null) {
        const ms = Math.round(lag * 1000);
        player.setLag(lag);
        localStorage.setItem(LAG_KEY, String(ms));
        settings.setLag(ms);
      }
      settings.show();
      screen = { kind: "settings" };
    },
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
    overButtons.hidden = true;
    backCorner.hidden = true;
    screen = { kind: "menu" };
    menu.show();
  };

  const startPlaying = (ready: ReadyScreen): void => {
    backCorner.hidden = true;
    player.start(ready.buffer, ready.audioShift, ready.volume, [
      ...ready.countIn,
      ...(query.has("tick") ? ready.play.times : []),
    ]);
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
      source: ready,
      feedback: null,
    };
  };

  /** The same song from the start, waiting for the start key, with nothing played yet. */
  const playAgain = (ended: Extract<Screen, { kind: "over" | "result" }>): void => {
    // After a finished song its outro may still be playing.
    player.stop();
    overButtons.hidden = true;
    backCorner.hidden = false;
    screen = { ...ended.source, play: new PlayState(ended.play.times) };
  };

  /** The game over places its buttons under its words; the result screen puts them under its numbers. */
  const placeEndButtons = (): void => {
    if (screen.kind !== "result") {
      overButtons.classList.remove("result");
      overButtons.style.removeProperty("left");
      overButtons.style.removeProperty("top");
      return;
    }
    const at = resultButtonsAt({ width: window.innerWidth, height: window.innerHeight });
    overButtons.classList.add("result");
    overButtons.style.left = `${at.x}px`;
    overButtons.style.top = `${at.y}px`;
  };
  window.addEventListener("resize", placeEndButtons);

  const backButton = element("button", "start secondary", "곡 선택");
  backButton.type = "button";
  // A tap anywhere else on this screen starts the song; this one must not.
  backButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  backButton.addEventListener("click", () => {
    if (screen.kind === "ready") backToMenu();
  });
  backCorner.append(backButton);

  const retryButton = element("button", "start", "다시 하기");
  const listButton = element("button", "start secondary", "곡 선택");
  for (const button of [retryButton, listButton]) button.type = "button";
  retryButton.addEventListener("click", () => {
    if (screen.kind === "over" || screen.kind === "result") playAgain(screen);
  });
  listButton.addEventListener("click", () => {
    if (screen.kind === "over" || screen.kind === "result") backToMenu();
  });
  overButtons.append(retryButton, listButton);

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
        if (event.code === "Enter") {
          if (!(event.target instanceof HTMLButtonElement)) tutorial.finish();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        tutorial.press(event.timeStamp);
        return;
      case "menu":
        if (event.code === "Escape") {
          stopPreview();
          menu.hide();
          title.show();
          screen = { kind: "title" };
          return;
        }
        menu.handleKey(event);
        return;
      case "settings":
        if (event.code === "Escape") {
          settings.hide();
          menu.show();
          screen = { kind: "menu" };
        }
        return;
      case "calibration":
        if (event.code === "Escape") {
          calibration.cancel();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        calibration.press(event.timeStamp);
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
      case "over":
        if (event.code === "Escape") backToMenu();
        else if (event.code === "Enter" && !(event.target instanceof HTMLButtonElement)) playAgain(screen);
        return;
      default:
        assertNever(screen);
    }
  });

  window.addEventListener("pointerdown", (event) => {
    if (screen.kind === "title") intro.skip();
    else if (screen.kind === "ready") startPlaying(screen);
    else if (screen.kind === "playing") press(screen, event.timeStamp);
    else if (screen.kind === "calibration" && !(event.target instanceof HTMLButtonElement)) {
      calibration.press(event.timeStamp);
    } else if (screen.kind === "tutorial" && !(event.target instanceof HTMLButtonElement)) {
      tutorial.press(event.timeStamp);
    }
  });

  const nextFrame = (): Frame => {
    switch (screen.kind) {
      case "title":
        return intro.advance(performance.now());
      case "tutorial":
      case "menu":
      case "settings":
      case "calibration":
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
        if (screen.play.overAt !== null) {
          player.stop();
          screen = {
            kind: "over",
            song: screen.song,
            difficulty: screen.difficulty,
            pictureName: screen.pictureName,
            sections: screen.sections,
            play: screen.play,
            path: screen.path,
            at: screen.play.overAt,
            source: screen.source,
          };
          placeEndButtons();
          overButtons.hidden = false;
          return nextFrame();
        }
        // The song may still be playing its outro here; it keeps going under the result screen.
        if (finaleProgress(screen.path, songTime) >= 1) {
          const { best, isNew, previous } = recordBest(screen.song.id, screen.play);
          screen = {
            kind: "result",
            song: screen.song,
            difficulty: screen.difficulty,
            pictureName: screen.pictureName,
            sections: screen.sections,
            play: screen.play,
            path: screen.path,
            shownAt: performance.now(),
            source: screen.source,
            bestGrade: best.grade,
            isNewBest: isNew,
            previousBestGrade: previous?.grade ?? null,
          };
          placeEndButtons();
          overButtons.hidden = false;
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
      case "over":
        return {
          kind: "playing",
          phase: "over",
          play: screen.play,
          path: screen.path,
          sections: screen.sections,
          songTime: screen.at,
          duration: screen.source.buffer.duration,
          feedback: null,
          bursts: [],
        };
      case "result":
        return {
          kind: "result",
          play: screen.play,
          path: screen.path,
          pictureName: screen.pictureName,
          title: screen.song.title,
          difficulty: screen.difficulty,
          bestGrade: screen.bestGrade,
          isNewBest: screen.isNewBest,
          previousBestGrade: screen.previousBestGrade,
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
