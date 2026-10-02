import { DIFFICULTIES, type Difficulty } from "./chart";
import { backwards, loadDrawing, routeOf } from "./drawing";
import { buildPath, type Path } from "./path";

/** The one-line drawings in public/pictures/<id>.svg, in the order they are dealt out to the charts. */
export const PICTURES = [
  "trex",
  "bicycle",
  "whale",
  "guitar",
  "stegosaurus",
  "sun",
  "cat",
  "crocodile",
  "birdcage",
  "horse",
  "sailboat",
  "swan",
  "rocket",
  "triceratops",
  "teapot",
  "brachiosaurus",
  "snail",
  "elephant",
  "eagle",
  "deer",
  "rooster",
  "rabbit",
  "pteranodon",
  "octopus",
  "butterfly",
  "fox",
  "violin",
  "owl",
  "lighthouse",
  "turtle",
  "giraffe",
  "gramophone",
  "penguin",
  "windmill",
  "seahorse",
  "bear",
  "piano",
  "flamingo",
  "train",
  "jellyfish",
  "camel",
  "sewing-machine",
  "peacock",
  "ferris-wheel",
  "frog",
  "emperor-penguin",
  "dog",
  "cupcake",
  "lion",
  "dolphin",
  "sheep",
  "ice-cream",
  "squirrel",
  "crab",
  "pig",
  "pineapple",
  "hedgehog",
  "goldfish",
  "duck",
  "ramen",
  "panda",
  "bee",
] as const;

export type Sewing = { readonly pictureName: string; readonly path: Path };

/**
 * The picture for one chart, and the road that sews it. The pictures are dealt out like cards to the charts,
 * in the order the songs are listed (`songNumber` counts from 0, of `songCount` songs), so no two charts sew
 * the same picture while there are enough pictures. A chart that is dealt more than one picture, and every
 * chart for the two ends a line can be sewn from, takes what its rhythm follows most closely, so that the
 * bends its notes force on the road fall where the picture bends anyway.
 */
export async function sewingFor(
  times: readonly number[],
  songNumber: number,
  songCount: number,
  difficulty: Difficulty,
): Promise<Sewing> {
  const turn = songNumber * DIFFICULTIES.length + DIFFICULTIES.indexOf(difficulty);
  const dealt = PICTURES.filter((_, i) => i % (songCount * DIFFICULTIES.length) === turn);
  const offered = dealt.length > 0 ? dealt : [PICTURES[turn % PICTURES.length] ?? PICTURES[0]];
  const drawings = await Promise.all(offered.map(loadDrawing));
  const sewings = drawings.flatMap((drawing) =>
    [routeOf(drawing), backwards(routeOf(drawing))].map((route) => ({
      pictureName: drawing.name,
      path: buildPath(times, route),
    })),
  );
  return sewings.reduce((best, sewing) => (sewing.path.drift < best.path.drift ? sewing : best));
}
