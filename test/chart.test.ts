import { describe, expect, test } from "bun:test";
import { chartSchema } from "../src/chart";

// 코드 리뷰 2026-11-04 중간: 노트가 오름차순이 아니거나 겹치면 판정·경로가 깨지는데 스키마가 받아 주던 문제.
const chart = (notes: number[]) => ({
  version: 4,
  title: "t",
  audio: "a.ogg",
  bpm: 120,
  offset: 0,
  duration: 10,
  anchors: [],
  difficulty: "easy",
  notes,
});

describe("chartSchema notes", () => {
  test("notes in strictly increasing order are accepted", () => {
    expect(chartSchema.safeParse(chart([0, 0.5, 1])).success).toBe(true);
    expect(chartSchema.safeParse(chart([])).success).toBe(true);
  });

  test("two notes at the same time are refused", () => {
    expect(chartSchema.safeParse(chart([0, 1, 1, 2])).success).toBe(false);
  });

  test("notes out of order are refused", () => {
    expect(chartSchema.safeParse(chart([0, 2, 1])).success).toBe(false);
  });

  test("a rhythm road is held to the same order", () => {
    expect(chartSchema.safeParse({ ...chart([0, 1, 1]), road: "rhythm", tempo: [[0, 120]] }).success).toBe(false);
  });
});
