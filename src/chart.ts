import { z } from "zod";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const songIdSchema = z.string().regex(/^[a-z0-9-]+$/);
const noteTimes = z.array(z.number().nonnegative());

/**
 * A rhythm road that also draws public/pictures/<name>.svg (tools/picture_road.ts writes it). `flips` are the indices of
 * the notes after which the crayon turns back the other way; with a picture these replace every other twirl rule. The
 * road is played as usual; on the result screen each piece of it, from tile `from` up to the next piece, moves to
 * `(x, y) + scale * rotate(angle) * tile`, in the picture's own units, and the pieces together make the picture.
 */
const roadPictureSchema = z.object({
  name: songIdSchema,
  flips: z.array(z.number().int().nonnegative()),
  pieces: z.array(z.object({
    from: z.number().int().nonnegative(),
    scale: z.number().positive(),
    angle: z.number(),
    x: z.number(),
    y: z.number(),
  })).min(1),
});
export type RoadPictureData = Readonly<z.infer<typeof roadPictureSchema>>;

const tempoSectionSchema = z.tuple([z.number().nonnegative(), z.number().positive()]);
const tempoMapSchema = z.tuple([tempoSectionSchema]).rest(tempoSectionSchema).refine(
  (tempo) => tempo[0][0] === 0 && tempo.every(([start], i) => i === 0 || start > (tempo[i - 1]?.[0] ?? 0)),
  "tempo must start at zero and have increasing section times",
);

const chartBase = z.object({
  version: z.literal(4),
  title: z.string(),
  audio: z.string(),
  artist: z.string().optional(),
  credit: z.string().optional(),
  bpm: z.number().positive(),
  offset: z.number(),
  duration: z.number().positive(),
  /** Times of a few sharp attacks, for `decodingShift` to find again. */
  anchors: noteTimes,
  difficulty: z.enum(DIFFICULTIES),
  notes: noteTimes,
});

export const chartSchema = z.union([
  chartBase.extend({ road: z.undefined().optional(), tempo: tempoMapSchema.optional() }),
  chartBase.extend({
    road: z.literal("rhythm"),
    tempo: tempoMapSchema,
    /** From each start time, how many times faster than the beat the crayon turns (1 = half a turn a beat). */
    turnScale: tempoMapSchema.optional(),
    /** Times of notes after which the crayon turns back the other way, set by hand. */
    twirls: z.array(z.number().nonnegative()).optional(),
    picture: roadPictureSchema.optional(),
  }),
]);

const noteCount = z.number().int().nonnegative();
const songSummarySchema = z.object({
  id: songIdSchema,
  title: z.string(),
  artist: z.string().optional(),
  credit: z.string().optional(),
  bpm: z.number().positive(),
  duration: z.number().positive(),
  difficulty: z.enum(DIFFICULTIES),
  notes: noteCount,
});
const songIndexSchema = z.object({ songs: z.array(songSummarySchema) });

export type SongChart = Readonly<z.infer<typeof chartSchema>>;
export type SongSummary = Readonly<z.infer<typeof songSummarySchema>>;
export type LoadedSong = { readonly chart: SongChart; readonly audio: ArrayBuffer };

export class SongLoadError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${url} (HTTP ${status})`);
    this.name = "SongLoadError";
  }
}

const SONGS_URL = `${import.meta.env.BASE_URL}songs`;

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new SongLoadError(url, response.status);
  return response;
}

export async function loadSongIndex(): Promise<readonly SongSummary[]> {
  return songIndexSchema.parse(await (await fetchOk(`${SONGS_URL}/index.json`)).json()).songs;
}

const picturePinsSchema = z.object({ pictures: z.record(songIdSchema, z.string().regex(/^[a-z0-9-]+$/)) });

/** The picture picked for each song (tools/pick_pictures.ts writes them), by song id. */
export async function loadPicturePins(): Promise<ReadonlyMap<string, string>> {
  const { pictures } = picturePinsSchema.parse(await (await fetchOk(`${SONGS_URL}/pictures.json`)).json());
  return new Map(Object.entries(pictures));
}

const songOrderSchema = z.object({ order: z.array(songIdSchema) });

/**
 * `songs` in the order the menu lists them: first the ids in `order.json` (best first within each difficulty), then
 * any song it leaves out, in their order in the song list. The song list's own order stays as it is, because the
 * pictures are dealt out by it.
 */
export async function inMenuOrder(songs: readonly SongSummary[]): Promise<readonly SongSummary[]> {
  const { order } = songOrderSchema.parse(await (await fetchOk(`${SONGS_URL}/order.json`)).json());
  const place = new Map(order.map((id, index) => [id, index]));
  const placeOf = (song: SongSummary): number => place.get(song.id) ?? order.length;
  return [...songs].sort((a, b) => placeOf(a) - placeOf(b));
}

export async function loadSong(rawSongId: string): Promise<LoadedSong> {
  const folder = `${SONGS_URL}/${songIdSchema.parse(rawSongId)}`;
  const chart = chartSchema.parse(await (await fetchOk(`${folder}/chart.json`)).json());
  const audio = await (await fetchOk(`${folder}/${chart.audio}`)).arrayBuffer();
  return { chart, audio };
}
