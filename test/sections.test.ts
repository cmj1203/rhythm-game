import { describe, expect, test } from "bun:test";
import { COLOR, JUDGEMENT_COLOR } from "../src/canvas";
import type { Path } from "../src/path";
import { dyePath, planSections, poseAt, type Section } from "../src/sections";

const BEAT = 0.5; // 120 bpm
/** Notes every `gap` seconds from `from` until before `to`. */
const run = (from: number, to: number, gap: number): number[] =>
  Array.from({ length: Math.round((to - from) / gap) }, (_, i) => from + i * gap);

describe("planSections", () => {
  // Sections are 16 beats = 8 s from the offset 1 s on.
  const times = [...run(1, 9, BEAT), ...run(9, 17, BEAT), ...run(17, 25, BEAT / 2), ...run(25, 33, BEAT * 4), ...run(33, 41, BEAT)];
  const sections = planSections(times, 120, 1);

  test("cuts the chart every 16 beats from the offset, each section starting at its first note", () => {
    expect(sections.map((section) => section.fromNote)).toEqual([0, 16, 32, 64, 68]);
    expect(sections.map((section) => section.startTime)).toEqual([1, 9, 17, 25, 33]);
    expect(sections.map((section) => section.endTime)).toEqual([9, 17, 25, 33, times[times.length - 1]]);
  });

  test("the first section is watched straight on; then the screen turns to alternate sides", () => {
    expect(sections[0]).toMatchObject({ zoom: 1, tilt: 0, move: "push" });
    expect(sections.slice(1).map((section) => Math.sign(section.tilt))).toEqual([-1, 1, -1, 1]);
  });

  test("a busy section pushes in closer and turns further; a quiet one pulls back", () => {
    const busy = sections[2] as Section;
    const quiet = sections[3] as Section;
    expect(busy.move).toBe("push");
    expect(quiet.move).toBe("pull");
    expect(busy.zoom).toBeCloseTo(0.93 * 1.12);
    expect(quiet.zoom).toBeCloseTo(1 * (1 - 0.12 * 0.75));
    expect(Math.abs(busy.tilt)).toBeCloseTo((12 * Math.PI) / 180);
    // Usual sections take the moves in turn.
    expect(sections[1]?.move).toBe("slide");
    expect(sections[4]?.move).toBe("push");
  });

  test("the thread changes every other section", () => {
    expect(sections.map((section) => section.thread)).toEqual([
      COLOR.thread,
      COLOR.thread,
      COLOR.pink,
      COLOR.pink,
      COLOR.sky,
    ]);
  });

  test("a stretch with no notes makes no section", () => {
    const gappy = planSections([1, 2, 25, 26], 120, 1);
    expect(gappy.map((section) => section.startTime)).toEqual([1, 25]);
    expect(planSections([], 120, 0)).toEqual([]);
  });
});

describe("poseAt", () => {
  const sections = planSections([...run(1, 9, BEAT), ...run(9, 17, BEAT), ...run(17, 21, BEAT)], 120, 1);

  test("with reduced motion the camera holds each section's own pose", () => {
    const second = sections[1] as Section;
    expect(poseAt(sections, 0, true)).toEqual({ zoom: 1, tilt: 0, slide: 0 });
    expect(poseAt(sections, 9, true)).toEqual({ zoom: second.zoom, tilt: second.tilt, slide: 0 });
    expect(poseAt([], 5, true)).toEqual({ zoom: 1, tilt: 0, slide: 0 });
  });

  test("before the song the camera stands back and comes in by 0.6 s before the first note", () => {
    // The first section pushes in, so it begins 15 % further back than its own distance.
    expect(poseAt(sections, -3, false).zoom).toBeCloseTo(0.62 * 0.85);
    expect(poseAt(sections, -0.6, false).zoom).toBeCloseTo(0.85);
  });

  test("halfway through a push the camera is at the section's own distance", () => {
    expect(poseAt(sections, 5, false)).toEqual({ zoom: 1, tilt: 0, slide: 0 });
  });

  test("the camera glides into the next section's move over 1.6 s around its first note", () => {
    const second = sections[1] as Section; // a slide: the road moves across while the screen stays turned
    const during = poseAt(sections, 9.8, false);
    expect(second.move).toBe("slide");
    expect(during.zoom).toBeCloseTo(second.zoom);
    expect(during.tilt).toBeCloseTo(second.tilt);
    expect(during.slide).toBeCloseTo(Math.sign(second.tilt) * 0.14 * (2 * 0.8 / 8 - 1));
    const halfway = poseAt(sections, 9, false);
    expect(halfway.tilt).toBeCloseTo(second.tilt / 2);
  });
});

describe("dyePath", () => {
  test("sews each section's piece of the picture in its thread and leaves hidden thread alone", () => {
    const path = {
      anchors: [0, 2, 4, 6],
      guide: { colors: ["#000000", "#000000", null, "#000000", "#000000", "#000000", "#000000"], endIndex: 6 },
    } as unknown as Path;
    const sections = [
      { fromNote: 0, thread: COLOR.pink },
      { fromNote: 2, thread: JUDGEMENT_COLOR.great },
    ] as unknown as Section[];
    const dyed = dyePath(path, sections);
    // The two pieces meet at anchor 4, which the later section dyes.
    expect(dyed.guide.colors).toEqual([COLOR.pink, COLOR.pink, null, COLOR.pink, JUDGEMENT_COLOR.great, JUDGEMENT_COLOR.great, JUDGEMENT_COLOR.great]);
    expect(path.guide.colors[0]).toBe("#000000");
  });
});
