// Real, silent autoplay through the normal menu, keyboard handler, audio clock and renderer.
// Phones: mobile-check URL --wait 0 --script tools/qa-rhythm-road.mjs --out /tmp/livecanvas-rhythm-road
// Desktop: bun tools/qa-rhythm-road.mjs --desktop
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

export default async function autoplay(page, { device, outDir }) {
  // Finish the first boot before reloading, so WebKit does not abort an in-flight intro fetch.
  await page.locator("#title button").waitFor({ state: "attached" });
  await page.addInitScript(() => {
    // Keep the hardware clock active, but zero every sample before the actual destination.
    const destinations = new WeakMap();
    const nativeDestination = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination").get;
    Object.defineProperty(BaseAudioContext.prototype, "destination", {
      configurable: true,
      get() {
        let sink = destinations.get(this);
        if (sink === undefined) {
          sink = this.createGain();
          sink.gain.value = 0;
          sink.connect(nativeDestination.call(this));
          destinations.set(this, sink);
        }
        return sink;
      },
    });
    localStorage.setItem("livecanvas.volume", "0");
  });
  await page.reload({ waitUntil: "load" });
  const muted = await page.evaluate(async () => {
    const context = new AudioContext();
    const disconnected = context.destination instanceof GainNode && context.destination.gain.value === 0;
    await context.close();
    return disconnected;
  });
  if (!muted) throw new Error("음소거 출력 우회가 적용되지 않았음");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shots = [];
  await page.exposeFunction("roadCheckpoint", (name) => {
    const pending = page.screenshot({ path: `${outDir}/${device}-${name}.png` });
    shots.push(pending);
    return pending.then(() => console.log(`${device} 화면 저장: ${name}`));
  });
  let startedAt = 0;
  await page.exposeFunction("roadStarted", () => { startedAt = Date.now(); });
  await page.exposeFunction("roadProgress", (info) => console.log(`${device} 연주 진행: ${JSON.stringify(info)}`));
  await page.evaluate(async (captureDuringPlay) => {
    // Vite may add ?t=... after an edit. Import the app's exact module instance.
    const resources = performance.getEntriesByType("resource");
    const renderUrl = resources.find((entry) => new URL(entry.name).pathname === "/src/render.ts")?.name;
    const audioUrl = resources.find((entry) => new URL(entry.name).pathname === "/src/audio.ts")?.name;
    if (renderUrl === undefined || audioUrl === undefined) throw new Error("실행 중인 게임 모듈을 찾을 수 없음");
    const { Renderer } = await import(renderUrl);
    const { SongPlayer } = await import(audioUrl);
    let player;
    let bufferSeconds = 0;
    let audibleSamples = false;
    const start = SongPlayer.prototype.start;
    SongPlayer.prototype.start = function (...args) {
      player = this;
      bufferSeconds = args[0].duration;
      audibleSamples = args[0].getChannelData(0).some((sample) => Math.abs(sample) > 0.01);
      window.roadStarted();
      return start.apply(this, args);
    };
    const draw = Renderer.prototype.draw;
    const checkpoints = new Map(captureDuringPlay ? [["riff", 22.5], ["rest", 25.15], ["tempo-196", 66.21]] : []);
    let completed = false;
    let pressed = 0;
    let lastProgress = -1;
    Renderer.prototype.draw = function (frame) {
      if (frame.kind === "playing" && frame.phase === "over") {
        window.dispatchEvent(new CustomEvent("rhythm-qa-failed", { detail: JSON.stringify(frame.play.counts) }));
      }
      if (frame.kind === "playing" && frame.phase === "playing" && player !== undefined) {
        const progress = Math.floor(frame.songTime / 10);
        if (progress > lastProgress) {
          lastProgress = progress;
          window.roadProgress({ songTime: frame.songTime, counts: frame.play.counts });
        }
        // Read the actual audio clock; timestamp input on the exact note without changing judgement.
        while ((frame.play.times[pressed] ?? Infinity) <= frame.songTime + 0.0001) {
          const note = frame.play.times[pressed];
          const now = performance.now();
          const stamp = now + (note - player.songTime(now)) * 1000;
          const event = new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true });
          Object.defineProperty(event, "timeStamp", { value: stamp });
          window.dispatchEvent(event);
          pressed++;
        }
        for (const [name, at] of checkpoints) {
          if (frame.songTime < at) continue;
          checkpoints.delete(name);
          window.roadCheckpoint(name);
        }
      }
      draw.call(this, frame);
      if (frame.kind === "result" && frame.fade === 1 && !completed) {
        completed = true;
        window.roadCheckpoint("result");
        window.__rhythmSummary = {
          counts: frame.play.counts,
          notes: frame.play.times.length,
          pictureName: frame.pictureName,
          road: frame.path.rhythm !== undefined,
          grade: frame.play.grade,
          bufferSeconds,
          audibleSamples,
          audioTime: player?.songTime(performance.now()),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
        window.dispatchEvent(new Event("rhythm-qa-complete"));
      }
    };
  }, device === "desktop");
  const completed = page.evaluate(() => new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("자동 연주 완료 신호 시간 초과")), 360000);
    window.addEventListener("rhythm-qa-complete", () => {
      clearTimeout(deadline);
      resolve(window.__rhythmSummary);
    }, { once: true });
    window.addEventListener("rhythm-qa-failed", (event) => {
      clearTimeout(deadline);
      reject(new Error(`자동 연주 중 게임 오버: ${event.detail}`));
    }, { once: true });
  }));
  await page.keyboard.press("Space");
  await page.locator("#title button").click();
  await page.locator("#tutorial button", { hasText: "곡 고르기" }).click();
  await page.locator("#menu button.start").first().click();
  await page.locator("#back").waitFor({ state: "visible" });
  await page.locator("#game").click();
  const summary = await completed;
  await Promise.all(shots);
  const report = { device, muted, startedAt, ...summary, errors };
  await writeFile(`${outDir}/${device}-autoplay.json`, JSON.stringify(report, null, 2));
  console.log(`${device} 자동 연주: ${JSON.stringify(report)}`);
  if (!summary.road || summary.pictureName !== "" || summary.counts.perfect !== summary.notes ||
      summary.counts.great !== 0 || summary.counts.good !== 0 || summary.counts.miss !== 0 ||
      !summary.audibleSamples || summary.overflow !== 0 || errors.length > 0) {
    throw new Error(`${device} 자동 연주 검증 실패`);
  }
  return report;
}

if (process.argv.includes("--desktop")) {
  const outDir = process.env["QA_OUT_DIR"] ?? "/tmp/livecanvas-rhythm-road";
  await mkdir(outDir, { recursive: true });
  const require = createRequire(`${process.env.HOME}/mobile-test/package.json`);
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: "ko-KR",
      recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();
    const videoStartedAt = Date.now();
    await page.goto("http://127.0.0.1:5187/?song=last-fortress", { waitUntil: "load" });
    const summary = await autoplay(page, { device: "desktop", outDir });
    const video = page.video();
    await context.close();
    const videoPath = await video.path();
    await writeFile(`${outDir}/video.json`, JSON.stringify({
      source: videoPath,
      // Eight seconds: dense riff around 19.5s into the 24.8-25.8s stop.
      clipFrom: (summary.startedAt - videoStartedAt) / 1000 + 3 + 19.5,
      duration: 8,
    }, null, 2));
    console.log(`데스크톱 영상 원본: ${videoPath}`);
  } finally {
    await browser.close();
  }
}
