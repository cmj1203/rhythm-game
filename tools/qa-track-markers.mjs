// mobile-check http://127.0.0.1:5187/ --wait 0 --script tools/qa-track-markers.mjs --out /tmp/livecanvas-crq-r2
// QA_OUT_DIR=/tmp/livecanvas-crq-r2 bun tools/qa-track-markers.mjs --desktop
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

export default async function checkMarkers(page, { device, outDir }) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#title button").waitFor({ state: "attached" });
  await page.addInitScript(() => localStorage.setItem("livecanvas.volume", "0"));
  await page.reload({ waitUntil: "load" });
  await page.keyboard.press("Space");
  await page.locator("#title button").click();
  await page.locator("#tutorial").waitFor({ state: "visible" });
  // The how-to-play picture is the game's own road drawing: wait for a frame with the crayon on it.
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".demo-road");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return false;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] > 450) lit++;
    return lit > 50;
  });
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.screenshot({ path: `${outDir}/${device}-${theme}-tutorial.png` });
  }
  await page.locator(".demo").screenshot({ path: `${outDir}/${device}-crayon.png` });
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.reload({ waitUntil: "load" });
  await page.locator("#title button").waitFor({ state: "attached" });
  const checked = await page.evaluate(async () => {
    const { COLOR, Painter, mixColors } = await import("/src/canvas.ts");
    const { drawPlaying } = await import("/src/track.ts");
    const { buildRhythmPath } = await import("/src/rhythm-road.ts");
    const { PlayState } = await import("/src/judge.ts");
    const notes = [1, 2, 3, 4, 5, 6];
    const base = buildRhythmPath(notes, [[0, 60]]);
    const cases = [
      ["slow", false], ["normal", false], ["fast", false], ["slow", false],
      ["normal", true], ["slow", true], ["fast", true],
    ];
    const sweeps = base.sweeps.map((sweep, i) => ({
      ...sweep, pace: cases[i][0], isTwirl: cases[i][1],
    }));
    const { rhythm, ...picture } = base;
    const size = { width: 800, height: 600 };
    const scale = 66;
    let checks = 0;
    for (const mode of ["picture", "rhythm"]) {
      // Real canvas draws: record circle operations without replacing rendering.
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      const painter = new Painter(ctx);
      const calls = [];
      let circle = null;
      const begin = ctx.beginPath.bind(ctx);
      ctx.beginPath = () => { circle = null; begin(); };
      const drawCircle = painter.circle.bind(painter);
      painter.circle = (center, radius) => {
        drawCircle(center, radius);
        circle = { ...center, radius };
      };
      for (const operation of ["fill", "stroke"]) {
        const draw = ctx[operation].bind(ctx);
        ctx[operation] = (...args) => {
          if (circle !== null) calls.push({
            ...circle, operation, color: operation === "fill" ? ctx.fillStyle : ctx.strokeStyle,
            width: ctx.lineWidth,
          });
          return draw(...args);
        };
      }
      drawPlaying(painter, {
        kind: "playing", phase: "playing", play: new PlayState(notes),
        path: mode === "rhythm" ? { ...base, sweeps } : { ...picture, sweeps },
        sections: [], songTime: 0.2, duration: 7, feedback: null, bursts: [],
      }, size);
      const fills = calls.filter((call) => call.operation === "fill").slice(0, cases.length);
      if (fills.length !== cases.length) throw new Error(`${mode}: 점 개수 불일치`);
      const normalize = (color) => { ctx.fillStyle = color; return ctx.fillStyle; };
      cases.forEach(([pace, twirl], i) => {
        const marked = pace !== "normal" || twirl;
        const isRhythm = mode === "rhythm";
        const paceColor = { normal: COLOR.text, fast: COLOR.pink, slow: COLOR.sky }[pace];
        const marker = twirl ? COLOR.violet : paceColor;
        const dot = isRhythm ? (pace !== "normal" && twirl ? paceColor : COLOR.text)
          : (pace === "normal" ? marker : paceColor);
        const radius = isRhythm ? (marked ? 0.055 : 0.07) : (marked ? 0.07 : 0.11);
        const fill = fills[i];
        if (Math.abs(fill.radius / scale - radius) > 1e-8 ||
            fill.color !== normalize(isRhythm ? mixColors(COLOR.background, dot, 0.6) : dot)) {
          throw new Error(`${mode} ${i}: 점 크기·색 불일치`);
        }
        if (marked) {
          const ring = calls.find((call) => call.operation === "stroke" &&
            call.x === fill.x && call.y === fill.y &&
            Math.abs(call.radius / scale - (isRhythm ? 0.14 : 0.18)) < 1e-8);
          if (isRhythm && i === 0) {
            if (ring !== undefined) throw new Error("리듬 길 착지 고리가 남음");
          } else if (ring === undefined ||
              ring.color !== normalize(isRhythm ? mixColors(marker, COLOR.background, 0.3) : marker) ||
              // Canvas implementations may store lineWidth as a 32-bit float.
              Math.abs(ring.width - Math.max(isRhythm ? 1.5 : 2, scale * (isRhythm ? 0.035 : 0.05))) > 1e-5) {
            throw new Error(`${mode} ${i}: 고리 크기·색·착지 유지 불일치 ${JSON.stringify({ ring, marker, scale })}`);
          }
        }
        checks++;
      });
    }
    const { Renderer } = await import("/src/render.ts");
    const { chartSchema } = await import("/src/chart.ts");
    const { planSections, dyePath } = await import("/src/sections.ts");
    const { sewingOf } = await import("/src/pictures.ts");
    const pictures = (await (await fetch("/songs/pictures.json")).json()).pictures;
    const renderer = new Renderer(document.querySelector("#game"));
    for (const root of document.querySelectorAll("main, section")) root.hidden = true;
    window.__reviewStill = async (id) => {
      const chart = chartSchema.parse(await (await fetch(`/songs/${id}/chart.json`)).json());
      const sections = planSections(chart.notes, chart.bpm, chart.offset);
      const path = dyePath(chart.road === "rhythm" ? buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls, chart.picture?.flips)
        : (await sewingOf(chart.notes, pictures[id])).path, sections);
      const time = chart.road === "rhythm" ? 22.5
        : (path.tiles[path.sweeps.findIndex((sweep) => sweep.pace !== "normal")]?.time ?? 5) + 0.15;
      const play = new PlayState(chart.notes);
      for (const note of chart.notes) if (note <= time) play.press(note);
      renderer.draw({
        kind: "playing", phase: "playing", play, path, sections,
        songTime: time, duration: chart.duration, feedback: null, bursts: [],
      });
    };
    return checks;
  });
  assert.equal(checked, 14);
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const id of ["8bit-dungeon-boss", "last-fortress"]) {
      await page.evaluate((song) => window.__reviewStill(song), id);
      await page.screenshot({ path: `${outDir}/${device}-${theme}-${id}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log(`${device}: 표식 ${checked}종·튜토리얼·두 곡 화면 통과, 페이지 오류 없음`);
}

if (process.argv.includes("--desktop")) {
  const outDir = process.env.QA_OUT_DIR ?? "/tmp/livecanvas-crq-r2";
  await mkdir(outDir, { recursive: true });
  const require = createRequire(`${process.env.HOME}/mobile-test/package.json`);
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
    await page.goto("http://127.0.0.1:5187/", { waitUntil: "load" });
    await checkMarkers(page, { device: "desktop", outDir });
  } finally {
    await browser.close();
  }
}
