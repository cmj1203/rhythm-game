// Picks a picture for each song, out of all the pictures, and keeps it in public/songs/pictures.json.
//
//   pnpm dev                      (in another terminal; the picking runs the game's own code in a browser)
//   bun tools/pick_pictures.ts    (only songs with no picture yet; the others keep theirs)
//   bun tools/pick_pictures.ts --all
//
// Every song is tried with every free picture, both ways along its line. The cost of a pair is how far the rhythm
// pushes the road off the picture, plus a large penalty for a picture that ends before the last note, a crayon
// that strays from its pace, or a long run of gentle bends. The pairs are then matched so that no two songs share
// a picture and the total cost is as low as it can be (the Hungarian method). The browser is muted.
import type { SewingStats } from "./sewing-stats";

const GAME_URL = process.env["GAME_URL"] ?? "http://localhost:5173/";
const WORKERS = 10;
const ROOT = new URL("..", import.meta.url).pathname;
const PINS_PATH = `${ROOT}public/songs/pictures.json`;

type Pins = Record<string, string>;

function cost(stats: SewingStats): number {
  const endPenalty = stats.emptyEnd >= 2 ? 1000 * stats.emptyEnd : 0;
  const speedPenalty = stats.p90Pct > 2 ? 1000 : 0;
  const bendPenalty = stats.gentleRun >= 6 ? 100 * (stats.gentleRun - 5) : 0;
  return stats.drift + endPenalty + speedPenalty + bendPenalty;
}

/** The column for each row that makes the total cost lowest, every column used at most once (rows <= columns). */
function assign(costs: readonly (readonly number[])[]): number[] {
  const rows = costs.length;
  const columns = costs[0]?.length ?? 0;
  const u = new Array<number>(rows + 1).fill(0);
  const v = new Array<number>(columns + 1).fill(0);
  const owner = new Array<number>(columns + 1).fill(0);
  const way = new Array<number>(columns + 1).fill(0);
  for (let row = 1; row <= rows; row++) {
    owner[0] = row;
    let column = 0;
    const least = new Array<number>(columns + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(columns + 1).fill(false);
    do {
      used[column] = true;
      const current = owner[column] ?? 0;
      let delta = Number.POSITIVE_INFINITY;
      let next = 0;
      for (let j = 1; j <= columns; j++) {
        if (used[j]) continue;
        const reduced = (costs[current - 1]?.[j - 1] ?? 0) - (u[current] ?? 0) - (v[j] ?? 0);
        if (reduced < (least[j] ?? 0)) {
          least[j] = reduced;
          way[j] = column;
        }
        if ((least[j] ?? 0) < delta) {
          delta = least[j] ?? 0;
          next = j;
        }
      }
      for (let j = 0; j <= columns; j++) {
        if (used[j]) {
          const holder = owner[j] ?? 0;
          u[holder] = (u[holder] ?? 0) + delta;
          v[j] = (v[j] ?? 0) - delta;
        } else {
          least[j] = (least[j] ?? 0) - delta;
        }
      }
      column = next;
    } while (owner[column] !== 0);
    do {
      const previous = way[column] ?? 0;
      owner[column] = owner[previous] ?? 0;
      column = previous;
    } while (column !== 0);
  }
  const picked = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= columns; j++) {
    const row = owner[j] ?? 0;
    if (row > 0) picked[row - 1] = j - 1;
  }
  return picked;
}

const statsScript = (songId: string, candidates: readonly string[]): string => `(async () => {
  const pictures = await import("/src/pictures.ts");
  const { sewingStats } = await import("/tools/sewing-stats.ts");
  const chart = await (await fetch("/songs/${songId}/chart.json")).json();
  const row = [];
  for (const name of ${JSON.stringify(candidates)}) row.push(sewingStats((await pictures.sewingOf(chart.notes, name)).path));
  return JSON.stringify(row);
})()`;

const all = process.argv.includes("--all");
const index = (await Bun.file(`${ROOT}public/songs/index.json`).json()) as { songs: { id: string }[] };
const songIds = index.songs.map((song) => song.id);
const saved: Pins = (await Bun.file(PINS_PATH).exists()) ? ((await Bun.file(PINS_PATH).json()) as { pictures: Pins }).pictures : {};
const kept: Pins = all ? {} : Object.fromEntries(Object.entries(saved).filter(([id]) => songIds.includes(id)));
const toPick = songIds.filter((id) => kept[id] === undefined);

const views = Array.from(
  { length: WORKERS },
  () => new Bun.WebView({ backend: { type: "chrome", argv: ["--mute-audio"], url: false }, width: 800, height: 600 }),
);
try {
  await Promise.all(views.map((view) => view.navigate(GAME_URL)));
  const allPictures = JSON.parse(
    (await views[0]?.evaluate(`(async () => JSON.stringify((await import("/src/pictures.ts")).PICTURES))()`)) as string,
  ) as string[];
  const taken = new Set(Object.values(kept));
  const candidates = allPictures.filter((name) => !taken.has(name));
  if (toPick.length > candidates.length) throw new Error(`${toPick.length} songs but only ${candidates.length} free pictures`);
  console.log(`picking for ${toPick.length} songs out of ${candidates.length} pictures (${WORKERS} muted browsers)`);

  const table = new Map<string, SewingStats[]>();
  const queue = [...toPick];
  await Promise.all(
    views.map(async (view) => {
      for (let songId = queue.shift(); songId !== undefined; songId = queue.shift()) {
        table.set(songId, JSON.parse((await view.evaluate(statsScript(songId, candidates))) as string) as SewingStats[]);
        console.log(`  measured ${table.size}/${toPick.length} ${songId}`);
      }
    }),
  );

  const rows = toPick.map((songId) => table.get(songId) ?? []);
  const picked = assign(rows.map((row) => row.map(cost)));
  const pins: Pins = { ...kept };
  let flagged = 0;
  toPick.forEach((songId, row) => {
    const column = picked[row] ?? -1;
    const name = candidates[column];
    const stats = rows[row]?.[column];
    if (name === undefined || stats === undefined) throw new Error(`no picture for ${songId}`);
    pins[songId] = name;
    const bad = cost(stats) >= 100;
    if (bad) flagged++;
    console.log(
      `${bad ? "FLAG " : ""}${songId} -> ${name} drift ${stats.drift.toFixed(3)} p90 ${stats.p90Pct} gentleRun ${stats.gentleRun} emptyEnd ${stats.emptyEnd}`,
    );
  });
  const sorted = Object.fromEntries(Object.entries(pins).sort(([a], [b]) => a.localeCompare(b)));
  await Bun.write(PINS_PATH, `${JSON.stringify({ pictures: sorted }, null, 1)}\n`);
  console.log(`wrote ${PINS_PATH}: ${Object.keys(sorted).length} songs, ${flagged} flagged`);
} finally {
  for (const view of views) view.close();
  Bun.spawnSync(["pkill", "-f", "bun-chrome"]);
}
