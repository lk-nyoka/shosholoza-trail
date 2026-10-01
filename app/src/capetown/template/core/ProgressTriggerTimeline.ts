/** Fires each crossed beat once, including when a slow frame skips its threshold. */
export class ProgressTriggerTimeline {
  private fired = new Set<number>();
  private beats: { at: number; fire: () => void }[];
  constructor(beats: { at: number; fire: () => void }[]) {
    this.beats = beats;
    if (beats.some(beat => !Number.isFinite(beat.at) || beat.at < 0 || beat.at > 1)) throw new Error('Invalid progress threshold');
  }
  update(progress: number) {
    if (!Number.isFinite(progress)) return;
    this.beats.forEach((beat, index) => {
      if (progress >= beat.at && !this.fired.has(index)) { this.fired.add(index); beat.fire(); }
    });
  }
}
