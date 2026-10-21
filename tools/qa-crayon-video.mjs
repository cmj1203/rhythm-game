// heavy -- bun tools/qa-crayon-video.mjs before|after
// Deterministic 60 fps rendering, not duplicated 25/30 fps screen recordings.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import roadStills from "./qa-road-stills.mjs";

const label = process.argv[2];
if (label !== "before" && label !== "after") throw new Error("before 또는 after를 지정해야 함");
const outDir = "/tmp/livecanvas-crayon";
const framesDir = `${outDir}/${label}-frames`;
const start = 70;
const fps = 60;
const duration = 7;
await mkdir(framesDir, { recursive: true });
const require = createRequire(`${process.env.HOME}/mobile-test/package.json`);
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
try {
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 }, deviceScaleFactor: 1,
    locale: "ko-KR", reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5187/?song=last-fortress", { waitUntil: "load" });
  await roadStills(page, { device: label, outDir });
  // A real unflagged picture chart is a pixel-level regression reference.
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource");
    const url = resources.find((entry) => new URL(entry.name).pathname === "/src/render.ts").name;
    const { Renderer } = await import(url);
    const { sewingOf } = await import("/src/pictures.ts");
    const { PlayState } = await import("/src/judge.ts");
    const { planSections, dyePath } = await import("/src/sections.ts");
    const chart = await (await fetch("/songs/blippy-trance/chart.json")).json();
    const pins = await (await fetch("/songs/pictures.json")).json();
    const sewing = await sewingOf(chart.notes, pins.pictures["blippy-trance"]);
    const sections = planSections(chart.notes, chart.bpm, chart.offset);
    const play = new PlayState(chart.notes);
    for (const note of chart.notes) if (note <= 22.5) play.press(note);
    new Renderer(document.querySelector("#game")).draw({
      kind: "playing", phase: "playing", play, path: dyePath(sewing.path, sections),
      sections, songTime: 22.5, duration: chart.duration, feedback: null, bursts: [],
    });
  });
  await page.screenshot({ path: `${outDir}/legacy-${label}.png` });
  for (let i = 0; i < duration * fps; i++) {
    await page.evaluate((time) => window.__roadStillAt(time), start + i / fps);
    await page.screenshot({ path: `${framesDir}/${String(i).padStart(4, "0")}.png` });
    if (i % 120 === 0) console.log(`${label} 렌더 프레임: ${i}/${duration * fps}`);
  }
  await context.close();
  if (errors.length > 0) throw new Error(JSON.stringify(errors));
} finally {
  await browser.close();
}
const encode = Bun.spawn([
  "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
  "-framerate", String(fps), "-i", `${framesDir}/%04d.png`, "-frames:v", String(duration * fps),
  "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", `${outDir}/${label}.mp4`,
], { stdout: "inherit", stderr: "inherit" });
const exit = await encode.exited;
if (exit !== 0) throw new Error(`영상 인코딩 종료 코드 ${exit}`);
await writeFile(`${outDir}/${label}-capture.json`, JSON.stringify({
  start, duration, fps, frames: duration * fps, width: 960, height: 600,
  muted: true, video: `${outDir}/${label}.mp4`,
}, null, 2));
console.log(`${label} 60fps 영상 완료: ${outDir}/${label}.mp4`);
