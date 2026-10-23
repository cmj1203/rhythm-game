// mobile-check URL --wait 0 --script tools/qa-road-stills.mjs --out /tmp/livecanvas-rhythm-road
// Render checkpoints separately from real-time autoplay: high-DPI screenshots must not block input.
export default async function roadStills(page, { device, outDir }) {
  await page.locator("#title button").waitFor({ state: "attached" });
  await page.addInitScript(() => {
    localStorage.setItem("livecanvas.volume", "0");
    window.requestAnimationFrame = () => 0;
  });
  await page.reload({ waitUntil: "load" });
  await page.locator("#title button").waitFor({ state: "attached" });
  await page.evaluate(async () => {
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
    const { buildRhythmPath } = await import(moduleUrl("rhythm-road"));
    const chart = chartSchema.parse(await (await fetch("/songs/last-fortress/chart.json")).json());
    const sections = planSections(chart.notes, chart.bpm, chart.offset);
    const path = dyePath(buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls, chart.picture?.flips, chart.repeats), sections);
    const renderer = new Renderer(document.querySelector("#game"));
    for (const root of document.querySelectorAll("main, section")) root.hidden = true;
    window.__roadStillAt = (time) => {
      const play = new PlayState(chart.notes);
      let feedback = null;
      const bursts = [];
      for (const note of chart.notes) {
        if (note > time) break;
        const hit = play.press(note);
        if (hit === null) continue;
        feedback = { ...hit, at: note };
        if (time - note <= 0.45) bursts.push(feedback);
      }
      renderer.draw({
        kind: "playing", phase: "playing", play, path, sections,
        songTime: time, duration: chart.duration, feedback, bursts,
      });
    };
    window.__roadStillResult = () => {
      const play = new PlayState(chart.notes);
      for (const note of chart.notes) play.press(note);
      renderer.draw({
        kind: "result", play, path, pictureName: "", title: chart.title,
        difficulty: chart.difficulty, bestGrade: play.grade, isNewBest: true,
        previousBestGrade: null, fade: 1,
      });
    };
  });
  for (const [name, time] of [["riff", 22.5], ["rest", 25.15], ["tempo-196", 66.21]]) {
    await page.evaluate((at) => window.__roadStillAt(at), time);
    await page.screenshot({ path: `${outDir}/${device}-${name}.png` });
    console.log(`${device} 상태 화면 갱신: ${name}`);
  }
  await page.evaluate(() => window.__roadStillResult());
}
