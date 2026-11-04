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
  test("four clicks one beat apart, the last one beat before the first note", () => {
    const notes = Array.from({ length: 40 }, (_, i) => 1 + i * 0.5);
    expect(countIn(120, notes)).toEqual([-1, -0.5, 0, 0.5]);
  });

  test("always four clicks, whatever the opening rhythm", () => {
    const notes = Array.from({ length: 40 }, (_, i) => 5 + i * 0.25);
    expect(countIn(120, notes)).toEqual([3, 3.5, 4, 4.5]);
    expect(countIn(120, [5, 9, 13])).toEqual([3, 3.5, 4, 4.5]);
  });

  test("a beat too slow to fit after the start key is halved until the clicks fit", () => {
    // At 60 BPM four beats before a note at 0.5 would start at -3.5, before 0.3 s after the start key (-2.7).
    const clicks = countIn(60, [0.5]);
    expect(clicks).toEqual([-1.5, -1, -0.5, 0]);
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
