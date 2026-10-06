import { z } from "zod";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const songIdSchema = z.string().regex(/^[a-z0-9-]+$/);
const noteTimes = z.array(z.number().nonnegative());

const chartSchema = z.object({
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
