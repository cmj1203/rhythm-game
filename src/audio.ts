export const LEAD_IN_S = 3;
const ANCHOR_LEVEL_S = 0.005;
const ANCHOR_SEARCH_S = 0.06;
const TICK_S = 0.03;
const TICK_PITCH = 1800;
const TICK_LOUDNESS = 0.4;

/**
 * How many seconds later (negative: earlier) this browser's decoded audio plays each sound than the chart
 * expects. Decoders disagree on how much of an mp3's leading padding to drop, so the chart lists `anchors`, the
 * times of a few sharp attacks as the chart tool's decoder heard them, and the same attacks are looked for here.
 * An attack is where the level of the last `ANCHOR_LEVEL_S` rises most over the level of the `ANCHOR_LEVEL_S`
 * before, which is how tools/make_chart.py measures it too. The answer is the middle one of the differences,
 * or 0 for a chart without anchors.
 */
export function decodingShift(buffer: AudioBuffer, anchors: readonly number[]): number {
  const rate = buffer.sampleRate;
  const width = Math.round(ANCHOR_LEVEL_S * rate);
  const reach = Math.round(ANCHOR_SEARCH_S * rate);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  const shifts: number[] = [];
  for (const anchor of anchors) {
    const from = Math.round(anchor * rate) - reach - 2 * width;
    const count = 2 * (reach + width);
    if (from < 0 || from + count > buffer.length) continue;
    // energy[k] is the energy of the mono mix in the `k` samples from `from` on.
    const energy = new Float64Array(count + 1);
    for (let k = 0; k < count; k++) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[from + k] ?? 0;
      mixed /= channels.length;
      energy[k + 1] = (energy[k] ?? 0) + mixed * mixed;
    }
    const levelUpTo = (k: number): number => Math.sqrt(((energy[k] ?? 0) - (energy[k - width] ?? 0)) / width);
    let sharpest = 2 * width;
    let steepest = Number.NEGATIVE_INFINITY;
    for (let k = 2 * width; k <= count; k++) {
      const rise = levelUpTo(k) - levelUpTo(k - width);
      if (rise > steepest) {
        steepest = rise;
        sharpest = k;
      }
    }
    shifts.push((from + sharpest) / rate - anchor);
  }
  shifts.sort((a, b) => a - b);
  return shifts[shifts.length >> 1] ?? 0;
}

export class SongPlayer {
  private readonly context = new AudioContext({ latencyHint: "interactive" });
  private source: AudioBufferSourceNode | null = null;
  private ticks: GainNode | null = null;
  private startAt = 0;

  /** Must be called from a user gesture: browsers keep audio suspended until one happens. */
  unlock(): Promise<void> {
    return this.context.resume();
  }

  decode(audio: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(audio);
  }

  /**
   * Plays `buffer` after the lead-in. `shift` is what `decodingShift` found for it, so song time follows the chart.
   * A short click sounds at each of the song times in `ticks`, for hearing whether a chart keeps time with its song.
   */
  start(buffer: AudioBuffer, shift: number, ticks: readonly number[]): void {
    this.stop();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const playAt = this.context.currentTime + LEAD_IN_S;
    source.start(playAt);
    this.startAt = playAt + shift;
    this.source = source;
    if (ticks.length === 0) return;

    const rate = this.context.sampleRate;
    const click = this.context.createBuffer(1, Math.round(TICK_S * rate), rate);
    const samples = click.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = TICK_LOUDNESS * Math.sin((2 * Math.PI * TICK_PITCH * i) / rate) * (1 - i / samples.length) ** 2;
    }
    const bus = this.context.createGain();
    bus.connect(this.context.destination);
    for (const time of ticks) {
      const tick = this.context.createBufferSource();
      tick.buffer = click;
      tick.connect(bus);
      tick.start(this.startAt + time);
    }
    this.ticks = bus;
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this.ticks?.disconnect();
    this.ticks = null;
  }

  /** Song position (seconds) heard at `performanceMs`; negative during the lead-in. */
  songTime(performanceMs: number): number {
    // getOutputTimestamp pairs the audio clock with the performance clock, so a key event's own
    // timestamp can be converted instead of sampling the clock whenever the handler happens to run.
    const stamp = this.context.getOutputTimestamp();
    if (stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0) {
      return stamp.contextTime + (performanceMs - stamp.performanceTime) / 1000 - this.startAt;
    }
    const latency = Number.isFinite(this.context.outputLatency) ? this.context.outputLatency : 0;
    return this.context.currentTime - latency - this.startAt;
  }
}
