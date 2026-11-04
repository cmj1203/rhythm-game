import { chartSchema } from "../src/chart";
import type { Path } from "../src/path";
import { revealedPath } from "../src/picture-reveal";
import { buildRhythmPath, type RoadPicture } from "../src/rhythm-road";

/** last-fortress 의 리듬 길과 조각 배치에, 그림 선 대신 단순한 선 두 개를 붙인 것. */
export async function lastFortressReveal(): Promise<{ readonly road: Path; readonly picture: RoadPicture }> {
  const chart = chartSchema.parse(await Bun.file(new URL("../public/songs/last-fortress/chart.json", import.meta.url)).json());
  if (chart.road !== "rhythm" || chart.picture === undefined) throw new Error("last-fortress 는 그림 리듬 길이어야 한다");
  const road = buildRhythmPath(chart.notes, chart.tempo, chart.turnScale, chart.twirls, chart.picture.flips, {
    pauses: chart.pauses,
    midspins: chart.midspins,
  });
  const strokes = [
    { part: 0, points: Array.from({ length: 200 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 9) * 40 })) },
    { part: 1, points: Array.from({ length: 120 }, (_, i) => ({ x: 300 - i, y: 80 + Math.cos(i / 7) * 30 })) },
  ];
  return { road, picture: { name: "test", strokes, pieces: chart.picture.pieces, traced: true } };
}

/** 결과 길을 몇 개의 수로 줄인 것. 같은 계산이면 같은 수가 나온다. */
export function fingerprint(path: Path): Record<string, number> {
  const round = (value: number): number => Math.round(value * 1e6) / 1e6;
  const { points, colors, bounds } = path.guide;
  return {
    points: points.length,
    sumX: round(points.reduce((sum, { x }) => sum + x, 0)),
    sumY: round(points.reduce((sum, { y }) => sum + y, 0)),
    nulls: colors.filter((color) => color === null).length,
    tileSum: round(path.tiles.reduce((sum, { x, y }) => sum + x + 2 * y, 0)),
    minX: round(bounds.minX),
    minY: round(bounds.minY),
    maxX: round(bounds.maxX),
    maxY: round(bounds.maxY),
  };
}

export async function revealFingerprints(): Promise<Record<string, number>[]> {
  const { road, picture } = await lastFortressReveal();
  return [
    [0, 0],
    [0.4, 0],
    [1, 0],
    [1, 1],
  ].map(([move, settle]) => fingerprint(revealedPath(road, picture, move ?? 0, settle ?? 0)));
}
