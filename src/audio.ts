export const LEAD_IN_S = 3;
/** The count-in clicks up to the first note, from this long after the start key, at most this many times. */
const COUNT_IN_FROM_S = 0.3;
const COUNT_IN_MAX_CLICKS = 8;
/**
 * It keeps to the rhythm of the notes in this many beats from the first: every half beat, beat or two beats,
 * whichever of those (no shorter or longer than these) the notes keep to best. A note keeps to a click when it is
 * within this share of the click spacing of it, at most `COUNT_IN_SLACK_S`.
 */
const COUNT_IN_OPENING_BEATS = 16;
const COUNT_IN_SHORTEST_S = 0.18;
const COUNT_IN_LONGEST_S = 1;
const COUNT_IN_SLACK_SHARE = 0.2;
const COUNT_IN_SLACK_S = 0.05;
const ANCHOR_LEVEL_S = 0.005;
const ANCHOR_SEARCH_S = 0.06;
const TICK_S = 0.03;
const TICK_PITCH = 1800;
const TICK_LOUDNESS = 0.075;
/** The clicks of the timing check play alone, so they are louder than the ticks laid over a song. */
const CHECK_LOUDNESS = 0.3;
/** How long after `startClicks` the first click sounds. */
const CHECK_LEAD_S = 0.6;
/** A preview plays this long from this far into the song (as a share of its length), past most intros. */
const PREVIEW_S = 12;
const PREVIEW_FROM = 0.3;
const PREVIEW_FADE_S = 0.6;
/**
 * Songs are mastered at very different levels. Every song plays at this root mean square (1 being full scale):
 * a louder one turned down to it, a quieter one turned up to it, so that all songs sound about as loud as each
 * other and as other sound on the same device.
 */
const SONG_RMS = 0.05;
/** A quiet song is turned up only so far that its loudest moment stays below full scale, and does not crackle. */
const MAX_PEAK = 0.99;

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

/** What to multiply `buffer` by as it plays, so that it plays at `SONG_RMS` without clipping. */
export function volumeFor(buffer: AudioBuffer): number {
  let squares = 0;
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i] ?? 0;
      squares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  if (peak === 0) return 1;
  return Math.min(SONG_RMS / Math.sqrt(squares / (buffer.length * buffer.numberOfChannels)), MAX_PEAK / peak);
}

/** Clicks every `every` seconds, one of them at `at`. */
type Pulse = { readonly at: number; readonly every: number };

/**
 * How well the notes of `opening` keep to `pulse`, from 0 to 1: the harmonic mean of the share of the notes that
 * fall on a click and the share of the clicks from the first note to the last that have a note on them.
 */
function keeping(opening: readonly number[], { at, every }: Pulse): number {
  const slack = Math.min(COUNT_IN_SLACK_S, every * COUNT_IN_SLACK_SHARE);
  const first = opening[0] ?? at;
  const last = opening[opening.length - 1] ?? at;
  const onClick = opening.filter((time) => Math.abs(time - at - Math.round((time - at) / every) * every) <= slack);
  let clicks = 0;
  let heard = 0;
  for (let k = Math.ceil((first - slack - at) / every); at + k * every <= last + slack; k += 1) {
    clicks += 1;
    if (opening.some((time) => Math.abs(time - at - k * every) <= slack)) heard += 1;
  }
  const notesShare = onClick.length / opening.length;
  const clicksShare = clicks === 0 ? 0 : heard / clicks;
  return notesShare + clicksShare === 0 ? 0 : (2 * notesShare * clicksShare) / (notesShare + clicksShare);
}

/**
 * Song times (negative during the lead-in) for a click on each pulse of the opening before the first note, so that
 * the clicks lead straight into it: the pulse (half beat, beat or two beats of `bpm`, lined up with one of the
 * opening notes) those notes keep to best, from just after the start key up to a quarter pulse before the first
 * note (a click on the note itself would sound like a hit), the last few of them. A busy opening clicks fast and a
 * sparse one slowly.
 */
export function countIn(bpm: number, notes: readonly number[]): number[] {
  const first = notes[0];
  if (first === undefined) return [];
  const beat = 60 / bpm;
  const opening = notes.filter((time) => time <= first + COUNT_IN_OPENING_BEATS * beat);
  let best: { readonly pulse: Pulse; readonly score: number } | null = null;
  // Longer pulses first, so that a tie keeps the calmer one.
  for (const every of [beat * 2, beat, beat / 2]) {
    if (every < COUNT_IN_SHORTEST_S || every > COUNT_IN_LONGEST_S) continue;
    for (const at of opening) {
      const score = keeping(opening, { at, every });
      if (best === null || score > best.score) best = { pulse: { at, every }, score };
    }
  }
  if (best === null) return [];
  const { at, every } = best.pulse;
  const times: number[] = [];
  for (let k = Math.floor((first - every / 4 - at) / every); times.length < COUNT_IN_MAX_CLICKS; k -= 1) {
    const time = at + k * every;
    if (time < COUNT_IN_FROM_S - LEAD_IN_S) break;
    times.unshift(time);
  }
  return times;
}

export class SongPlayer {
  private readonly context = new AudioContext({ latencyHint: "interactive" });
  private source: AudioBufferSourceNode | null = null;
  private ticks: GainNode | null = null;
  /** Everything the player plays goes through this, at the share of full volume the player has chosen. */
  private readonly output = this.context.createGain();
  private startAt = 0;
  /**
   * How much later than the browser reports the player hears each sound and presses for it, in seconds, as the
   * timing check measured. Song time is moved back by this much, for the judging and the picture alike.
   */
  private lag = 0;

  setVolume(share: number): void {
    this.output.gain.value = share;
  }

  setLag(seconds: number): void {
    this.lag = seconds;
  }

  /** Must be called from a user gesture: browsers keep audio suspended until one happens. */
  unlock(): Promise<void> {
    return this.context.resume();
  }

  decode(audio: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(audio);
  }

  /**
   * Plays `buffer` after the lead-in, at `volume` of its own level. `shift` is what `decodingShift` found for it,
   * so song time follows the chart. A short click sounds at each of the song times in `ticks`, for hearing
   * whether a chart keeps time with its song.
   */
  start(buffer: AudioBuffer, shift: number, volume: number, ticks: readonly number[]): void {
    this.stop();
    const source = this.context.createBufferSource();
    const level = this.context.createGain();
    level.gain.value = volume;
    source.buffer = buffer;
    this.output.connect(this.context.destination);
    source.connect(level).connect(this.output);
    const playAt = this.context.currentTime + LEAD_IN_S;
    source.start(playAt);
    this.startAt = playAt + shift;
    this.source = source;
    if (ticks.length === 0) return;

    this.playClicks(ticks, TICK_LOUDNESS);
  }

  /** Plays a stretch of `buffer`, fading in and out, at `volume` of its own level, for hearing a song before playing it. */
  preview(buffer: AudioBuffer, volume: number): void {
    this.stop();
    const source = this.context.createBufferSource();
    const level = this.context.createGain();
    const at = this.context.currentTime;
    const length = Math.min(PREVIEW_S, buffer.duration * (1 - PREVIEW_FROM));
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(volume, at + PREVIEW_FADE_S);
    level.gain.setValueAtTime(volume, at + length - PREVIEW_FADE_S);
    level.gain.linearRampToValueAtTime(0, at + length);
    source.buffer = buffer;
    this.output.connect(this.context.destination);
    source.connect(level).connect(this.output);
    source.start(at, buffer.duration * PREVIEW_FROM, length);
    this.source = source;
  }

  /**
   * Plays only a click at each of `times`, the first `CHECK_LEAD_S` from now, for the timing check. Afterwards
   * `heardTime` counts from the moment the clicks count from.
   */
  startClicks(times: readonly number[]): void {
    this.stop();
    this.output.connect(this.context.destination);
    this.startAt = this.context.currentTime + CHECK_LEAD_S;
    this.playClicks(times, CHECK_LOUDNESS);
  }

  private playClicks(times: readonly number[], loudness: number): void {
    const rate = this.context.sampleRate;
    const click = this.context.createBuffer(1, Math.round(TICK_S * rate), rate);
    const samples = click.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = loudness * Math.sin((2 * Math.PI * TICK_PITCH * i) / rate) * (1 - i / samples.length) ** 2;
    }
    const bus = this.context.createGain();
    bus.connect(this.output);
    for (const time of times) {
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

  /** Song position (seconds) the player is at, at `performanceMs`; negative during the lead-in. */
  songTime(performanceMs: number): number {
    return this.heardTime(performanceMs) - this.lag;
  }

  /** Song position (seconds) coming out of the speakers at `performanceMs`, as far as the browser knows. */
  heardTime(performanceMs: number): number {
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
