import { describe, expect, test } from "bun:test";
import { chartSchema } from "../src/chart";
import { buildRhythmPath } from "../src/rhythm-road";
import { aheadEnd, laterPasses, phraseBounds, phraseSpans } from "../src/road-view";
import { beatsBetween } from "../src/tempo";
import { standingAt } from "../src/walking-crayon";

const tempo = [[0, 120]] as const;
const evenly = (count: number, beats: number): number[] => Array.from({ length: count }, (_, i) => i * beats / 2);

async function lastFortress() {
  const chart = chartSchema.parse(await Bun.file("public/songs/last-fortress/chart.json").json());
  if (chart.road !== "rhythm") throw new Error("Last Fortress is a rhythm road");
  return { chart, path: buildRhythmPath(chart.notes, chart.tempo, chart.turnScale) };
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

  test("bracketed phrases are laid-again phrases or their first appearance, and never overlap", async () => {
    // Given the shipped chart.
    const { path } = await lastFortress();
    const laid = path.rhythm.phrases.flatMap(({ from, to, count }) => [from, to].map((at) => `${at + 1}-${at + count + 1}`));
    // When its bracketed spans are listed.
    const spans = phraseSpans(path);
    // Then each is one of those phrases, they run in order touching at most end to start, and each opens then closes.
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every(({ start, end }) => laid.includes(`${start}-${end}`))).toBe(true);
    expect(spans.every((span, i) => i === 0 || (spans[i - 1]?.end ?? Infinity) <= span.start)).toBe(true);
    expect(phraseBounds(path).map(({ kind }) => kind)).toEqual(spans.flatMap(() => ["open", "close"]));
  });

  test("a turn-around, rest or tempo marker shows at least two beats before its tile", async () => {
    // Given the shipped chart and its marked tiles.
    const { path } = await lastFortress();
    const marked = path.tiles.map((_, i) =>
      path.sweeps[i]?.isTwirl === true || path.sweeps[i]?.pace === "slow" || path.rhythm.marks[i] != null);
    const firstSeen = new Map<number, number>();
    // When the song clock runs through the song in hundredths.
    const last = path.tiles.at(-1)?.time ?? 0;
    for (let time = path.tiles[0]?.time ?? 0; time <= last; time += 0.01) {
      const standing = standingAt(path.tiles, time);
      const end = aheadEnd(path, standing, time);
      const later = laterPasses(path, standing, end);
      for (let i = standing; i <= end; i++) if (marked[i] === true && !later.has(i) && !firstSeen.has(i)) firstSeen.set(i, time);
    }
    // Then each marker first showed two beats or more before the crayon reached its tile.
    const late = [...firstSeen].filter(([i, seen]) =>
      i > 1 && beatsBetween(path.rhythm.tempo, seen, path.tiles[i]?.time ?? 0) < 2);
    expect(late).toEqual([]);
  });
});
