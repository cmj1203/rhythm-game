import { describe, expect, test } from "bun:test";
import { revealedPath, revealStage, REVEAL_DELAY_MS, REVEAL_LINES_MS, REVEAL_MOVE_MS } from "../src/picture-reveal";
import { buildRhythmPath, type RoadPicture } from "../src/rhythm-road";

const tempo = [[0, 480]] as const;
/** Half beats turn 90 degrees each, so the road would close a square at once and twirl away from it by itself. */
const square = Array.from({ length: 12 }, (_, i) => i * 0.0625);
const twirledNotes = (flips?: readonly number[]): number[] =>
  buildRhythmPath(square, tempo, undefined, [], flips).sweeps.flatMap((sweep, i) => (sweep.isTwirl ? [i - 1] : []));

describe("a road laid for a picture", () => {
  test("turns back after exactly the given notes", () => {
    // Given a square that twirls on its own to stay clear of itself.
    expect(twirledNotes().length).toBeGreaterThan(0);
    // When the picture names its own flips, or none at all.
    // Then the crayon turns back after those notes only.
    expect(twirledNotes([2, 7])).toEqual([2, 7]);
    expect(twirledNotes([])).toEqual([]);
  });

  test("moves each piece onto its place in the picture and leaves out the stroke between pieces", () => {
    // Given a road cut into two pieces, the second one turned a quarter, doubled and moved.
    const road = buildRhythmPath(square, tempo, undefined, [], []);
    const picture: RoadPicture = {
      name: "test",
      strokes: [],
      pieces: [
        { from: 0, scale: 1, angle: 0, x: 0, y: 0 },
        { from: 6, scale: 2, angle: Math.PI / 2, x: 50, y: 40 },
      ],
    };
    // When the pieces have moved all the way.
    const moved = revealedPath(road, picture, 1);
    // Then every tile of a piece stands where the piece's placement puts it.
    for (const [i, tile] of road.tiles.entries()) {
      const piece = i < 6 ? picture.pieces[0]! : picture.pieces[1]!;
      const cos = Math.cos(piece.angle);
      const sin = Math.sin(piece.angle);
      expect(moved.tiles[i]!.x).toBeCloseTo(piece.x + piece.scale * (tile.x * cos - tile.y * sin), 9);
      expect(moved.tiles[i]!.y).toBeCloseTo(piece.y + piece.scale * (tile.x * sin + tile.y * cos), 9);
    }
    // And the stroke from the last tile of the first piece to the first of the second is not coloured.
    const join = moved.guide.colors.slice(road.anchors[5]!, road.anchors[6]!);
    expect(join.length).toBeGreaterThan(0);
    expect(join.every((color) => color === null)).toBe(true);
    expect(moved.guide.colors.slice(road.anchors[6]!, road.anchors[7]!).every((color) => color !== null)).toBe(true);
    // And before moving, the road is the road as played.
    const unmoved = revealedPath(road, picture, 0).tiles;
    for (const [i, tile] of road.tiles.entries()) {
      expect(unmoved[i]!.x).toBeCloseTo(tile.x, 9);
      expect(unmoved[i]!.y).toBeCloseTo(tile.y, 9);
    }
  });

  test("waits, moves the pieces, then shows the picture's lines", () => {
    // Given the result screen's clock.
    // When it is read before, during and after the move.
    // Then the lines only come in once the pieces have arrived.
    expect(revealStage(REVEAL_DELAY_MS)).toEqual({ move: 0, lines: 0 });
    expect(revealStage(REVEAL_DELAY_MS + REVEAL_MOVE_MS / 2)).toEqual({ move: 0.5, lines: 0 });
    expect(revealStage(REVEAL_DELAY_MS + REVEAL_MOVE_MS)).toEqual({ move: 1, lines: 0 });
    expect(revealStage(REVEAL_DELAY_MS + REVEAL_MOVE_MS + REVEAL_LINES_MS)).toEqual({ move: 1, lines: 1 });
  });
});
