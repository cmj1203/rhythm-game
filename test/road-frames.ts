import { chartSchema } from "../src/chart";
import { PlayState } from "../src/judge";
import { buildRhythmPath } from "../src/rhythm-road";
import { dyePath, planSections } from "../src/sections";
import type { PlayingFrame } from "../src/track";

/** breach(멈춤·제자리 돌기가 있는 리듬 길) 한 판의 화면들. `times` 초마다 한 장. */
export async function breachFrames(times: readonly number[]): Promise<PlayingFrame[]> {
  const chart = chartSchema.parse(await Bun.file(new URL("../public/songs/breach/chart.json", import.meta.url)).json());
  if (chart.road !== "rhythm") throw new Error("breach 는 리듬 길이어야 한다");
  const road = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls, chart.picture?.flips, {
    pauses: chart.pauses,
    midspins: chart.midspins,
  });
  const sections = planSections(chart.notes, chart.bpm, chart.offset);
  const path = dyePath(road, sections);
  return times.map((songTime) => {
    const play = new PlayState(chart.notes);
    for (const time of chart.notes) if (time < songTime) play.press(time);
    return { kind: "playing", phase: "playing", play, path, sections, songTime, duration: chart.duration, feedback: null, bursts: [] };
  });
}

/** 멈춤(pauses) 노트 둘레가 화면에 보이는 시각들. */
export const BREACH_TIMES = [5, 40, 41.5, 60, 125, 126.5, 162, 163];
