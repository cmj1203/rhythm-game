// Checks what every song draws on screen, with the game's own code in a muted browser.
//
//   pnpm dev                      (in another terminal)
//   bun tools/check_screen.ts
//
// A song fails when its crayon strays from its pace (p90 over 2%), its picture ends two or more notes before the
// last note, or six or more gentle bends come in a row. Two songs drawing the same picture fail too.
// Exits with 1 when anything fails.
export {};

const GAME_URL = process.env["GAME_URL"] ?? "http://localhost:5173/";

// Always a headless shell: without a path Bun would open the desktop Chrome app.
// Install it with `bunx playwright install chromium-headless-shell`, or point CHROME_HEADLESS_SHELL at one.
function headlessShell(): string {
  const fromEnv = process.env["CHROME_HEADLESS_SHELL"];
  if (fromEnv !== undefined) return fromEnv;
  const cache = `${process.env["HOME"]}/Library/Caches/ms-playwright`;
  const found = [...new Bun.Glob("chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell").scanSync(cache)].sort();
  const newest = found.at(-1);
  if (newest === undefined) {
    console.error(`no chrome-headless-shell under ${cache}; install it or set CHROME_HEADLESS_SHELL`);
    process.exit(2);
  }
  return `${cache}/${newest}`;
}

const script = `(async () => {
  const { loadSongIndex, loadPicturePins } = await import("/src/chart.ts");
  const pictures = await import("/src/pictures.ts");
  const { sewingStats } = await import("/tools/sewing-stats.ts");
  const { buildRhythmPath } = await import("/src/rhythm-road.ts");
  const { roadStats } = await import("/tools/road-stats.ts");
  const songs = await loadSongIndex();
  const pins = await loadPicturePins();
  const rows = [];
  for (const [number, song] of songs.entries()) {
    const chart = await (await fetch("/songs/" + song.id + "/chart.json")).json();
    if (chart.road === "rhythm") {
      rows.push({ id: song.id, difficulty: chart.difficulty, road: roadStats(buildRhythmPath(chart.notes, chart.tempo, chart.turnScale)) });
      continue;
    }
    const pinned = pins.get(song.id);
    const sewing = pinned === undefined
      ? await pictures.sewingFor(chart.notes, number, songs.length, chart.difficulty)
      : await pictures.sewingOf(chart.notes, pinned);
    rows.push({ id: song.id, difficulty: chart.difficulty, picture: sewing.pictureName, pinned: pinned !== undefined, ...sewingStats(sewing.path) });
  }
  return JSON.stringify(rows);
})()`;

type Row = {
  id: string;
  difficulty: string;
  picture: string;
  pinned: boolean;
  p90Pct: number;
  speedOffPct: number;
  gentleRun: number;
  emptyEnd: number;
} | { readonly id: string; readonly difficulty: string; readonly road: ReturnType<typeof import("./road-stats").roadStats> };

const view = new Bun.WebView({ headless: true, backend: { type: "chrome", path: headlessShell(), argv: ["--mute-audio"], url: false }, width: 800, height: 600 });
let failed = 0;
try {
  await view.navigate(GAME_URL);
  const rows = JSON.parse((await view.evaluate(script)) as string) as Row[];
  const users = new Map<string, string[]>();
  for (const row of rows) {
    if ("road" in row) continue;
    users.set(row.picture, [...(users.get(row.picture) ?? []), row.id]);
  }
  for (const row of rows) {
    if ("road" in row) {
      const { pink, speedOff, illegalTwirl, guideOff } = row.road;
      const bad = pink > 0 || speedOff > 0 || illegalTwirl > 0 || guideOff > 0;
      if (bad) failed++;
      console.log(`${bad ? "FAIL" : "ok  "} ${row.id} [${row.difficulty}] rhythm ${JSON.stringify(row.road)}`);
      continue;
    }
    const problems = [
      row.p90Pct > 2 ? `p90 ${row.p90Pct}%` : "",
      row.emptyEnd >= 2 ? `ends ${row.emptyEnd} notes early` : "",
      row.gentleRun >= 6 ? `${row.gentleRun} gentle bends in a row` : "",
      (users.get(row.picture)?.length ?? 0) > 1 ? `picture shared with ${users.get(row.picture)?.join(", ")}` : "",
      row.pinned ? "" : "no picture picked (run tools/pick_pictures.ts)",
    ].filter(Boolean);
    if (problems.length > 0) failed++;
    console.log(
      `${problems.length > 0 ? "FAIL" : "ok  "} ${row.id} [${row.difficulty}] ${row.picture} p90 ${row.p90Pct} speedOff ${row.speedOffPct} gentleRun ${row.gentleRun} emptyEnd ${row.emptyEnd}${problems.length > 0 ? ` -- ${problems.join("; ")}` : ""}`,
    );
  }
  console.log(`${rows.length} songs, ${users.size} different pictures, ${failed} failing`);
} finally {
  view.close();
}
process.exit(failed > 0 ? 1 : 0);
