import { describe, expect, test } from "bun:test";
import { chartSchema } from "../src/chart";
import { buildRhythmPath } from "../src/rhythm-road";
import { aheadEnd, laterPasses } from "../src/road-view";
import { beatsBetween } from "../src/tempo";
import { standingAt } from "../src/walking-crayon";

const tempo = [[0, 120]] as const;
const evenly = (count: number, beats: number): number[] => Array.from({ length: count }, (_, i) => i * beats / 2);

async function shippedRoad(id: string) {
  const chart = chartSchema.parse(await Bun.file(`public/songs/${id}/chart.json`).json());
  if (chart.road !== "rhythm") throw new Error(`${id} is a rhythm road`);
  return { chart, path: buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls, chart.picture?.flips) };
}

describe("rhythm road view", () => {
  test.each([
    [1, 6],
    [1 / 2, 8],
    [1 / 4, 12],
  ])("gaps of %s beat show %i tiles ahead", (beats, shown) => {
    // Given an even run at 120 BPM, standing on its first note.
    const path = buildRhythmPath(evenly(40, beats), tempo);
    // When the road ahead is cut.
    const end = aheadEnd(path, 1, path.tiles[1]?.time ?? 0);
    // Then four beats are shown, but at least 6 and at most 12 tiles.
    expect(end - 1).toBe(shown);
  });

  test("a square of half beats keeps its second pass back until the first is over", () => {
    // Given half beats that turn the same way four times and come round to the same spot.
    const path = buildRhythmPath(evenly(9, 1 / 2), tempo);
    const near = (a: number, b: number): boolean => {
      const [p, q] = [path.tiles[a], path.tiles[b]];
      return p !== undefined && q !== undefined && Math.hypot(p.x - q.x, p.y - q.y) < 0.5;
    };
    const revisits = path.tiles.findIndex((_, i) => path.tiles.some((_, j) => j >= 1 && j < i - 1 && near(j, i)));
    const first = path.tiles.findIndex((_, j) => j >= 1 && j < revisits - 1 && near(j, revisits));
    expect(revisits).toBeGreaterThan(2);
    expect(first).toBeGreaterThan(0);
    // When the road is looked at from before the first pass, and from on it.
    const before = laterPasses(path, first - 1, revisits);
    const onIt = laterPasses(path, first, revisits);
    // Then the second pass waits while the first is ahead, and shows once the crayon stands on the first.
    expect(before.has(revisits)).toBe(true);
    expect(onIt.has(revisits)).toBe(false);
  });

  test.each(["last-fortress", "eight-arms"])("%s: a turn-around, rest or tempo marker shows at least two beats before its tile", async (id) => {
    // Given the shipped chart and its marked tiles.
    const { path } = await shippedRoad(id);
    const marked = path.tiles.map((_, i) =>
      path.sweeps[i]?.isTwirl === true || path.sweeps[i]?.pace === "slow" || path.rhythm.marks[i] != null);
    // 같은 자리(0.5칸 안)를 앞서 지나는 마지막 칸. 표식은 크레파스가 그 칸에 올라설 때까지 숨는다(laterPasses).
    const lastEarlierPass = path.tiles.map((tile, i) => {
      for (let j = i - 1; j >= 1; j--) {
        const earlier = path.tiles[j];
        if (earlier !== undefined && Math.hypot(earlier.x - tile.x, earlier.y - tile.y) < 0.5) return j;
      }
      return -1;
    });
    const firstSeen = new Map<number, number>();
    // When the song clock runs through the song in hundredths, and stops on every tile's own time too.
    const last = path.tiles.at(-1)?.time ?? 0;
    const times: number[] = [];
    for (let time = path.tiles[0]?.time ?? 0; time <= last; time += 0.01) times.push(time);
    times.push(...path.tiles.map(({ time }) => time));
    times.sort((a, b) => a - b);
    for (const time of times) {
      const standing = standingAt(path.tiles, time);
      const end = aheadEnd(path, standing, time);
      const later = laterPasses(path, standing, end);
      for (let i = standing; i <= end; i++) if (marked[i] === true && !later.has(i) && !firstSeen.has(i)) firstSeen.set(i, time);
    }
    // Then each marker first showed two beats or more before the crayon reached its tile. 그림 길처럼 2박 안에
    // 같은 자리를 다시 지나면, 크레파스가 앞 통과 칸에 올라서는 순간에 보인다.
    const beatsTo = (i: number, from: number): number => beatsBetween(path.rhythm.tempo, from, path.tiles[i]?.time ?? 0);
    const late = [...firstSeen].filter(([i, seen]) => {
      const earlier = path.tiles[lastEarlierPass[i] ?? -1];
      const lead = earlier === undefined ? 2 : Math.min(2, beatsTo(i, earlier.time));
      return i > 1 && beatsTo(i, seen) < lead - 1e-9;
    });
    expect(late).toEqual([]);
  });
});
