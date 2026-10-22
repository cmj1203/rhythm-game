// heavy -- bun tools/qa-hit-feel.mjs
// Silent, deterministic 60 fps renders of mixed judgements on Last Fortress: a normal-speed clip, a quarter-speed
// clip and stills just after a Perfect, a Good, a miss and an accent kick.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";

const outDir = process.env["QA_OUT_DIR"] ?? "/tmp/livecanvas-hitfeel";
const fps = 60;
const clips = [
  { name: "normal", from: 19.5, seconds: 6.5, speed: 1 },
  { name: "slow", from: 21.2, seconds: 1.2, speed: 0.25 },
];
await mkdir(outDir, { recursive: true });
const require = createRequire(`${process.env.HOME}/mobile-test/package.json`);
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const stills = {};
try {
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, locale: "ko-KR", reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("livecanvas.volume", "0");
    window.requestAnimationFrame = () => 0;
  });
  await page.goto("http://127.0.0.1:5187/?song=last-fortress", { waitUntil: "load" });
  await page.locator("#title button").waitFor({ state: "attached" });
  const marks = await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const moduleUrl = (name) => {
      const entry = resources.find((resource) => new URL(resource.name).pathname === `/src/${name}.ts`);
      if (entry === undefined) throw new Error(`게임 모듈 없음: ${name}`);
      return entry.name;
    };
    const { Renderer } = await import(moduleUrl("render"));
    const { PlayState } = await import(moduleUrl("judge"));
    const { planSections, dyePath } = await import(moduleUrl("sections"));
    const { chartSchema } = await import(moduleUrl("chart"));
    const { accentsOf, buildRhythmPath } = await import(moduleUrl("rhythm-road"));
    const chart = chartSchema.parse(await (await fetch("/songs/last-fortress/chart.json")).json());
    const sections = planSections(chart.notes, chart.bpm, chart.offset);
    const path = dyePath(buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls), sections);
    const accents = accentsOf(chart.notes, chart.tempo, chart.offset);
    const renderer = new Renderer(document.querySelector("#game"));
    for (const root of document.querySelectorAll("main, section")) root.hidden = true;
    const offsetOf = (i) => (i % 23 === 22 ? null : i % 11 === 10 ? -0.1 : i % 7 === 6 ? 0.06 : 0);
    window.__hitFeelAt = (time) => {
      const play = new PlayState(chart.notes);
      let feedback = null;
      const bursts = [];
      const keep = (event) => {
        feedback = event;
        if (time - event.at <= 0.45) bursts.push(event);
      };
      for (const [i, note] of chart.notes.entries()) {
        const offset = offsetOf(i);
        const at = offset === null ? note + 0.13 : note + offset;
        if (at > time) break;
        for (const event of play.advance(at)) keep({ ...event, at, accent: false });
        if (offset === null) continue;
        const hit = play.press(at);
        if (hit !== null) keep({ ...hit, at, accent: (accents[hit.index] ?? false) || play.combo % 50 === 0 });
      }
      for (const event of play.advance(time)) keep({ ...event, at: time, accent: false });
      renderer.draw({
        kind: "playing", phase: "playing", play, path, sections,
        songTime: time, duration: chart.duration, feedback, bursts,
      });
    };
    const after = (pick) => {
      const i = chart.notes.findIndex((note, k) => note > 20 && pick(k));
      return { index: i, time: chart.notes[i] + (offsetOf(i) ?? 0.13) };
    };
    return {
      perfect: after((k) => offsetOf(k) === 0 && !accents[k]),
      good: after((k) => offsetOf(k) === -0.1),
      miss: after((k) => offsetOf(k) === null),
      kick: after((k) => offsetOf(k) === 0 && accents[k]),
      accents: accents.filter(Boolean).length,
    };
  });
  for (const [name, mark, at] of [
    ["perfect", "perfect", 0.03], ["dust", "perfect", 0.12], ["good", "good", 0.03], ["miss", "miss", 0.06],
    ["kick", "kick", 0.02],
  ]) {
    const time = marks[mark].time + at;
    await page.evaluate((t) => window.__hitFeelAt(t), time);
    const file = `${outDir}/still-${name}.png`;
    await page.screenshot({ path: file });
    stills[name] = { file, songTime: time, note: marks[mark].index };
  }
  for (const clip of process.env["QA_STILLS_ONLY"] === undefined ? clips : []) {
    const framesDir = `${outDir}/${clip.name}-frames`;
    await mkdir(framesDir, { recursive: true });
    const frames = Math.round(clip.seconds * fps);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.__hitFeelAt(t), clip.from + (i / fps) * clip.speed);
      await page.screenshot({ path: `${framesDir}/${String(i).padStart(4, "0")}.png` });
    }
    const encode = Bun.spawn([
      "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y", "-framerate", String(fps),
      "-i", `${framesDir}/%04d.png`, "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${outDir}/${clip.name}.mp4`,
    ], { stdout: "inherit", stderr: "inherit" });
    if ((await encode.exited) !== 0) throw new Error(`영상 인코딩 실패: ${clip.name}`);
    console.log(`영상 완료: ${outDir}/${clip.name}.mp4`);
  }
  await context.close();
  if (errors.length > 0) throw new Error(JSON.stringify(errors));
  await writeFile(`${outDir}/capture.json`, JSON.stringify({ muted: true, stills, clips, accents: marks.accents }, null, 2));
  console.log(JSON.stringify({ stills, accents: marks.accents }));
} finally {
  await browser.close();
}
