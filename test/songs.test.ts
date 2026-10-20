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
    expect(chart.notes).toHaveLength(summary?.["notes"]);
    const notes: number[] = chart.notes;
    expect(notes.every((time, i) => time >= 0 && time <= chart.duration && (i === 0 || time > (notes[i - 1] ?? 0)))).toBe(true);
    expect(existsSync(join(SONGS, id, chart.audio))).toBe(true);
  });

  test("order.json lists every song exactly once", () => {
    const { order } = readJson(join(SONGS, "order.json"));
    expect([...order].sort()).toEqual([...ids].sort());
  });

  test("pictures.json picks an existing picture for every song, no two the same", () => {
    const { pictures } = readJson(join(SONGS, "pictures.json"));
    expect(Object.keys(pictures).sort()).toEqual([...ids].sort());
    const picked = Object.values(pictures) as string[];
    expect(new Set(picked).size).toBe(picked.length);
    for (const name of picked) expect(existsSync(join(PICTURES, `${name}.svg`))).toBe(true);
  });
});
