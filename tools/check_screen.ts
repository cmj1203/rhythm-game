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

const script = `(async () => {
  const { loadSongIndex, loadPicturePins } = await import("/src/chart.ts");
  const pictures = await import("/src/pictures.ts");
  const { sewingStats } = await import("/tools/sewing-stats.ts");
  const songs = await loadSongIndex();
  const pins = await loadPicturePins();
  const rows = [];
  for (const [number, song] of songs.entries()) {
    const chart = await (await fetch("/songs/" + song.id + "/chart.json")).json();
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
};

const view = new Bun.WebView({ backend: { type: "chrome", argv: ["--mute-audio"], url: false }, width: 800, height: 600 });
let failed = 0;
try {
  await view.navigate(GAME_URL);
  const rows = JSON.parse((await view.evaluate(script)) as string) as Row[];
  const users = new Map<string, string[]>();
  for (const row of rows) users.set(row.picture, [...(users.get(row.picture) ?? []), row.id]);
  for (const row of rows) {
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
  console.log(`${rows.length} songs, ${new Set(rows.map((row) => row.picture)).size} different pictures, ${failed} failing`);
} finally {
  view.close();
  Bun.spawnSync(["pkill", "-f", "bun-chrome"]);
}
process.exit(failed > 0 ? 1 : 0);
