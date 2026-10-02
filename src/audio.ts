export const LEAD_IN_S = 2;

export class SongPlayer {
  private readonly context = new AudioContext({ latencyHint: "interactive" });
  private source: AudioBufferSourceNode | null = null;
  private startAt = 0;

  /** Must be called from a user gesture: browsers keep audio suspended until one happens. */
  unlock(): Promise<void> {
    return this.context.resume();
  }

  decode(audio: ArrayBuffer): Promise<AudioBuffer> {
    return this.context.decodeAudioData(audio);
  }

  start(buffer: AudioBuffer): void {
    this.stop();
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.startAt = this.context.currentTime + LEAD_IN_S;
    source.start(this.startAt);
    this.source = source;
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
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
