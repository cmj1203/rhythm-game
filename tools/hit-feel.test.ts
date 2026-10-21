import { describe, expect, test } from "bun:test";
import { chartSchema } from "../src/chart";
import { accentsOf } from "../src/rhythm-road";

describe("big moments", () => {
  test("bar starts, comebacks after a rest and tempo changes are accents, ordinary notes are not", () => {
    // Given two bars at 120 BPM (half a second a beat), a rest of two beats, then a faster section.
    const tempo = [[0, 120], [6, 240]] as const;
    const times = [0, 0.5, 1, 1.5, 2, 2.5, 4, 4.5, 6, 6.25];
    // When the accents are picked with the first downbeat at 0.
    const accents = accentsOf(times, tempo, 0);
    // Then 0 and 2 (bar starts), 4 (bar start after a rest) and 6 (new tempo) are accents.
    expect(accents).toEqual([true, false, false, false, true, false, true, false, true, false]);
  });

  test("Last Fortress keeps its kicks to a minority of its notes", async () => {
    // Given the shipped chart.
    const chart = chartSchema.parse(await Bun.file("public/songs/last-fortress/chart.json").json());
    if (chart.road !== "rhythm") throw new Error("Last Fortress is a rhythm road");
    // When its accents are picked.
    const accents = accentsOf(chart.notes, chart.tempo, chart.offset);
    const share = accents.filter(Boolean).length / accents.length;
    // Then some notes kick the screen, but at most a quarter of them.
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(0.25);
  });
});
