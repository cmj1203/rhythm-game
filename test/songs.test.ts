import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The shipped song files must agree with each other, as the menu (index.json) and the game (chart.json) read them.
const SONGS = join(import.meta.dir, "../public/songs");
const PICTURES = join(import.meta.dir, "../public/pictures");
const readJson = (path: string): any => JSON.parse(readFileSync(path, "utf8"));

const index: { id: string; [key: string]: unknown }[] = readJson(join(SONGS, "index.json")).songs;
const ids = index.map((song) => song.id);

describe("public/songs", () => {
  test("every song folder is listed once in index.json", () => {
    const folders = readdirSync(SONGS, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect([...ids].sort()).toEqual(folders.map((entry) => entry.name).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(ids)("%s: chart.json matches index.json and its notes are in order within the song", (id) => {
    const summary = index.find((song) => song.id === id);
    const chart = readJson(join(SONGS, id, "chart.json"));
    expect(chart.version).toBe(4);
    expect(["easy", "normal", "hard"]).toContain(chart.difficulty);
    for (const key of ["title", "artist", "credit", "bpm", "duration", "difficulty"]) {
      expect(chart[key]).toEqual(summary?.[key]);
    }
    expect(chart.notes).toHaveLength(summary?.["notes"] as number);
    const notes: number[] = chart.notes;
    expect(notes.every((time, i) => time >= 0 && time <= chart.duration && (i === 0 || time > (notes[i - 1] ?? 0)))).toBe(true);
    expect(existsSync(join(SONGS, id, chart.audio))).toBe(true);
  });

  // Songs made for the game (artist "LiveCanvas", shown on the New shelf) are not ranked in order.json, and their
  // rhythm road brings its own picture in chart.json, so pictures.json does not pick one for them.
  const isNew = (song: { readonly [key: string]: unknown }): boolean => song["artist"] === "LiveCanvas";
  const newIds = index.filter(isNew).map((song) => song.id);
  const rankedIds = index.filter((song) => !isNew(song)).map((song) => song.id);

  test("order.json lists every song but the New ones exactly once, and only songs that exist", () => {
    const { order } = readJson(join(SONGS, "order.json"));
    expect(new Set(order).size).toBe(order.length);
    for (const id of order) expect(ids).toContain(id);
    for (const id of rankedIds) expect(order).toContain(id);
  });

  test("pictures.json picks an existing picture for every song but the New ones, no two the same", () => {
    const { pictures } = readJson(join(SONGS, "pictures.json"));
    for (const id of Object.keys(pictures)) expect(ids).toContain(id);
    for (const id of rankedIds) expect(Object.keys(pictures)).toContain(id);
    const picked = rankedIds.map((id) => pictures[id] as string);
    expect(new Set(picked).size).toBe(picked.length);
    for (const name of picked) expect(existsSync(join(PICTURES, `${name}.svg`))).toBe(true);
  });

  test.each(newIds)("%s: a rhythm road whose own picture exists", (id) => {
    const chart = readJson(join(SONGS, id, "chart.json"));
    expect(chart.road).toBe("rhythm");
    expect(existsSync(join(PICTURES, `${chart.picture.name}.svg`))).toBe(true);
  });
});
