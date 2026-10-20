import { describe, expect, test } from "bun:test";
import { countIn, decodingShift, LEAD_IN_S, volumeFor } from "../src/audio";

/** A stand-in for a decoded AudioBuffer: only what the level measurements read. */
function buffer(channels: readonly Float32Array[], sampleRate = 48000): AudioBuffer {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  } as unknown as AudioBuffer;
}

describe("countIn", () => {
  test("clicks on the notes' beat up to just before the first note, from the lead-in", () => {
    const notes = Array.from({ length: 40 }, (_, i) => 1 + i * 0.5);
    expect(countIn(120, notes)).toEqual([-2.5, -2, -1.5, -1, -0.5, 0, 0.5]);
  });

  test("never more than eight clicks, the last eight before the first note", () => {
    const notes = Array.from({ length: 40 }, (_, i) => 5 + i * 0.25);
    const clicks = countIn(120, notes);
    expect(clicks).toHaveLength(8);
    expect(clicks[clicks.length - 1]).toBe(4.75);
    expect(clicks[0]).toBe(3);
  });

  test("a sparse opening clicks slowly", () => {
    const notes = Array.from({ length: 10 }, (_, i) => 2 + i * 1);
    const clicks = countIn(120, notes);
    expect(clicks).toEqual([-2, -1, 0, 1]);
    expect(clicks[0] ?? 0).toBeGreaterThanOrEqual(0.3 - LEAD_IN_S);
  });

  test("no notes, no clicks", () => {
    expect(countIn(120, [])).toEqual([]);
  });
});

describe("volumeFor", () => {
  test("silence plays as it is", () => {
    expect(volumeFor(buffer([new Float32Array(100)]))).toBe(1);
  });

  test("a steady level is brought to an RMS of 0.05", () => {
    expect(volumeFor(buffer([new Float32Array(100).fill(0.25)]))).toBeCloseTo(0.2, 6);
  });

  test("a quiet song is turned up only until its peak reaches 0.99", () => {
    const samples = new Float32Array(10000);
    samples[0] = 0.5;
    expect(volumeFor(buffer([samples]))).toBeCloseTo(0.99 / 0.5, 6);
  });
});

describe("decodingShift", () => {
  const rate = 48000;
  /** Silence, then a steady tone from `attackS` on. */
  const stepAt = (attackS: number): AudioBuffer => {
    const samples = new Float32Array(rate);
    samples.fill(0.5, Math.round(attackS * rate));
    return buffer([samples, samples], rate);
  };

  test("an attack heard 10 ms later than before reads as 10 ms more shift", () => {
    const anchors = [0.5];
    const shift = decodingShift(stepAt(0.5), anchors);
    expect(decodingShift(stepAt(0.51), anchors) - shift).toBeCloseTo(0.01, 6);
    expect(decodingShift(stepAt(0.48), anchors) - shift).toBeCloseTo(-0.02, 6);
  });

  test("a chart without usable anchors gets no shift", () => {
    expect(decodingShift(stepAt(0.5), [])).toBe(0);
    // Too near the start or the end of the audio to search around.
    expect(decodingShift(stepAt(0.5), [0.01, 0.99])).toBe(0);
  });
});
