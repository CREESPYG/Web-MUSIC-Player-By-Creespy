import { useEffect } from "react";

/**
 * A deterministic pseudo-spectrum engine. YouTube streams can't be piped into
 * WebAudio (cross-origin), so the visuals are driven by a layered oscillator
 * field phase-locked to the track's tempo seed — it swells while playing,
 * breathes while paused, and kicks on the beat.
 */
class BeatEngine {
  playing = false;
  bpm = 96;
  seed = 1;
  env = 0;
  last = 0;
  bars = new Float32Array(48);
  level = 0;
  bass = 0;
  pulse = 0;

  setPlaying(p: boolean) {
    this.playing = p;
  }
  setTrack(bpm: number, seed: number) {
    this.bpm = bpm;
    this.seed = seed;
  }

  /** Cached timestamp to avoid recomputing within the same frame */
  private _cachedAt = -1;

  read(nowMs: number) {
    // Frame-dedup: if read() was already called this frame (within 2ms), return cached result
    if (Math.abs(nowMs - this._cachedAt) < 2) return this;
    this._cachedAt = nowMs;

    const t = nowMs / 1000;
    const dt = this.last ? Math.min(0.1, t - this.last) : 0.016;
    this.last = t;

    const target = this.playing ? 1 : 0.14;
    const k = 1 - Math.exp(-dt * (this.playing ? 3.4 : 1.5));
    this.env += (target - this.env) * k;
    const e = this.env;

    const beatPhase = ((t * this.bpm) / 60 + this.seed) % 1;
    this.pulse = Math.exp(-beatPhase * 5.5) * e;

    let sum = 0;
    for (let i = 0; i < this.bars.length; i++) {
      const f = i / this.bars.length;
      const bandBias = i < 10 ? 1.18 : i < 30 ? 0.85 : 0.62;
      const w1 = Math.sin(t * (1.7 + f * 5.1) + this.seed * 7 + i * 0.7);
      const w2 = Math.sin(t * (3.9 + f * 8.7) + this.seed * 13 + i * 1.9);
      const w3 = Math.sin(t * (0.9 + f * 2.3) + Math.sin(t * 1.3 + i) * 2 + this.seed);
      const kick = i < 12 ? this.pulse * (1 - i / 12) : 0;
      const raw = (0.42 + 0.27 * w1 + 0.17 * w2 + 0.14 * w3) * bandBias;
      const shaped = Math.min(1, Math.max(0.03, raw)) * (0.25 + 0.75 * e) + kick;
      const prev = this.bars[i];
      this.bars[i] = prev + (shaped - prev) * (shaped > prev ? 0.55 : 0.16);
      sum += this.bars[i];
    }
    this.level = sum / this.bars.length;
    this.bass = (this.bars[0] + this.bars[2] + this.bars[4]) / 3;
    return this;
  }
}

export const beat = new BeatEngine();

/** Keeps the shared engine in sync with player state. */
export function useBeatDriver(playing: boolean, bpm: number, seed: number) {
  useEffect(() => {
    beat.setPlaying(playing);
  }, [playing]);
  useEffect(() => {
    beat.setTrack(bpm, seed);
  }, [bpm, seed]);
}
