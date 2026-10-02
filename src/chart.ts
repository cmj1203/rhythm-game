import { z } from "zod";
import { LANE_COUNT } from "./lanes";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const songIdSchema = z.string().regex(/^[a-z0-9-]+$/);

const noteSchema = z.object({
  t: z.number().nonnegative(),
  lane: z
    .number()
    .int()
    .min(0)
    .max(LANE_COUNT - 1),
  end: z.number().positive().optional(),
});

const chartSchema = z.object({
  version: z.literal(2),
  title: z.string(),
  audio: z.string(),
  artist: z.string().optional(),
  credit: z.string().optional(),
  bpm: z.number().positive(),
  offset: z.number(),
  duration: z.number().positive(),
  charts: z.object({
    easy: z.array(noteSchema),
    normal: z.array(noteSchema),
    hard: z.array(noteSchema),
  }),
});

const noteCount = z.number().int().nonnegative();
const songSummarySchema = z.object({
  id: songIdSchema,
  title: z.string(),
  artist: z.string().optional(),
  credit: z.string().optional(),
  bpm: z.number().positive(),
  duration: z.number().positive(),
  notes: z.object({ easy: noteCount, normal: noteCount, hard: noteCount }),
});
const songIndexSchema = z.object({ songs: z.array(songSummarySchema) });

export type ChartNote = Readonly<z.infer<typeof noteSchema>>;
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

export async function loadSong(rawSongId: string): Promise<LoadedSong> {
  const folder = `${SONGS_URL}/${songIdSchema.parse(rawSongId)}`;
  const chart = chartSchema.parse(await (await fetchOk(`${folder}/chart.json`)).json());
  const audio = await (await fetchOk(`${folder}/${chart.audio}`)).arrayBuffer();
  return { chart, audio };
}
