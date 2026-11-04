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
    expect(sections.map((section) => section.endTime)).toEqual([9, 17, 25, 33, times.at(-1) ?? Number.NaN]);
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

  // 접근성 감사 2026-11-04: 구간마다 기울기·줌이 경계에서 한 번에 바뀌던 것을 없앤다.
  test("with reduced motion the camera holds the starting pose through every section", () => {
    const second = sections[1] as Section;
    expect(second.tilt).not.toBe(0);
    expect(poseAt(sections, 0, true)).toEqual({ zoom: 1, tilt: 0, slide: 0 });
    expect(poseAt(sections, 9, true)).toEqual({ zoom: 1, tilt: 0, slide: 0 });
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

// 코드 리뷰 2026-11-04 낮음: 템포가 바뀌는 차트는 구간을 템포 맵의 박으로 센다.
describe("planSections 와 템포 맵", () => {
  test("템포 맵이 있으면 16박을 그 맵의 박으로 센다", () => {
    // 0~8초는 120BPM(16박 = 8초), 8초부터는 60BPM(16박 = 16초). 노트는 1초마다.
    const times = run(0, 41, 1);
    const sections = planSections(times, 120, 0, [[0, 120], [8, 60]]);
    expect(sections.map((section) => section.startTime)).toEqual([0, 8, 24, 40]);
  });

  test("템포 맵이 없으면 기본 BPM 으로 센다(지금과 같음)", () => {
    const times = run(0, 41, 1);
    expect(planSections(times, 120, 0).map((section) => section.startTime)).toEqual([0, 8, 16, 24, 32, 40]);
    expect(planSections(times, 120, 0, undefined)).toEqual(planSections(times, 120, 0));
  });

  test("breach: 템포 구간이 바뀐 뒤에도 각 구간은 새 16박 묶음의 첫 노트에서 시작한다", async () => {
    const { beatsBetween } = await import("../src/tempo");
    const chart = await Bun.file(new URL("../public/songs/breach/chart.json", import.meta.url)).json();
    const sections = planSections(chart.notes, chart.bpm, chart.offset, chart.tempo);
    const bar = (time: number): number => Math.floor(beatsBetween(chart.tempo, chart.offset, time) / 16 + 1e-9);
    for (const section of sections.slice(1)) {
      const before = chart.notes[section.fromNote - 1];
      expect(bar(section.startTime)).toBeGreaterThan(bar(before));
    }
    // 노트가 있는 16박 묶음마다 구간이 하나씩 있다.
    expect(sections.length).toBe(new Set(chart.notes.map(bar)).size);
  });
});
