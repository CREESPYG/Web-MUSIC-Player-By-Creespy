import { useEffect } from "react";

/**
 * High-Precision Musical Audio Beat & Rhythm Engine.
 * Synchronizes visual effects tightly with real track playback time, tempo (BPM),
 * and 4/4 measure structure (downbeat kick on 1, backbeat snare on 2 & 4, 16th sub-pulses).
 */
class BeatEngine {
  playing = false;
  bpm = 96;
  seed = 1;
  trackTime = 0;
  lastSyncMs = performance.now();
  env = 0;
  lastReadTime = 0;

  // Real-time audio beat telemetry
  level = 0;
  bass = 0;
  mid = 0;
  treble = 0;
  pulse = 0;
  downbeat = 0;
  beatPhase = 0;
  measureBeat = 0;
  bars = new Float32Array(48);

  sync(trackTimeSec: number, isPlaying: boolean, bpm: number, seed: number) {
    this.trackTime = Math.max(0, trackTimeSec || 0);
    this.lastSyncMs = performance.now();
    this.playing = isPlaying;
    this.bpm = bpm > 40 && bpm < 240 ? bpm : 96;
    this.seed = seed || 1;
  }

  setPlaying(p: boolean) {
    this.playing = p;
    this.lastSyncMs = performance.now();
  }

  setTrack(bpm: number, seed: number) {
    this.bpm = bpm > 40 && bpm < 240 ? bpm : 96;
    this.seed = seed || 1;
  }

  /** Frame deduplication timestamp */
  private _cachedAt = -1;

  read(nowMs: number) {
    if (Math.abs(nowMs - this._cachedAt) < 2) return this;
    this._cachedAt = nowMs;

    const dt = this.lastReadTime ? Math.min(0.08, (nowMs - this.lastReadTime) / 1000) : 0.016;
    this.lastReadTime = nowMs;

    // Smooth envelope: reaches 1.0 when playing, drops to 0.12 when paused
    const targetEnv = this.playing ? 1 : 0.12;
    const k = 1 - Math.exp(-dt * (this.playing ? 4.5 : 1.8));
    this.env += (targetEnv - this.env) * k;
    const e = this.env;

    // Determine current audio playback position in seconds
    let currentSec = this.trackTime;
    if (this.playing) {
      const elapsedSinceSync = Math.max(0, (nowMs - this.lastSyncMs) / 1000);
      currentSec += elapsedSinceSync;
    } else {
      // Gentle ambient drift time when paused
      currentSec = nowMs * 0.001;
    }

    // Exact musical beat calculation
    const beatsPerSec = this.bpm / 60;
    const fractionalBeat = currentSec * beatsPerSec + (this.seed * 0.05);
    const beatIndex = Math.floor(fractionalBeat);
    const beatPhase = fractionalBeat - beatIndex; // 0.0 to 1.0 within beat
    this.beatPhase = beatPhase;
    this.measureBeat = Math.abs(beatIndex % 4); // 0 = Beat 1 (Kick), 1 = Beat 2, 2 = Beat 3, 3 = Beat 4

    // 1. Kick Attack & Decay Envelope (instant on beat 0.0, punchy decay)
    const kickCurve = Math.max(0, 1 - beatPhase * 3.4);
    const kick = kickCurve * kickCurve * e;

    // 2. Downbeat Kick (Beat 1 of measure — heavy bass punch)
    const isDownbeat = this.measureBeat === 0;
    const downbeatVal = isDownbeat ? kick * 1.55 : kick * 0.85;
    this.downbeat = downbeatVal;

    // 3. Snare / Clap Backbeat (Beats 2 & 4 — mid resonance)
    const isBackbeat = this.measureBeat === 1 || this.measureBeat === 3;
    const snare = isBackbeat ? Math.pow(Math.max(0, 1 - beatPhase * 3.8), 2) * e : 0;

    // 4. 16th-note Shimmer & Subdivisions (high frequencies & particles)
    const sub16 = (fractionalBeat * 4) % 1;
    const hihat = Math.pow(Math.max(0, 1 - sub16 * 4.2), 2) * 0.4 * e;

    // Master pulse: instantaneous punch of kick or snare
    this.pulse = Math.max(kick, snare * 0.75);

    // Audio Frequency Bands:
    // Bass: sub-bass pulse + periodic low harmonic
    this.bass = Math.min(1, Math.max(0.08, 0.12 + downbeatVal * 0.82 + Math.sin(currentSec * 2.2) * 0.05 * e));
    // Mid: snare snap + harmonic warmth
    this.mid = Math.min(1, Math.max(0.06, 0.1 + snare * 0.7 + kick * 0.2 + Math.cos(currentSec * 3.5) * 0.04 * e));
    // Treble: hi-hat sizzle + high frequency drift
    this.treble = Math.min(1, Math.max(0.05, 0.08 + hihat * 0.75 + Math.sin(currentSec * 6.5) * 0.03 * e));

    // Aggregate sound level
    this.level = Math.min(1, this.bass * 0.48 + this.mid * 0.32 + this.treble * 0.2);

    // Physical 48-band FFT Spectrum Emulation
    for (let i = 0; i < this.bars.length; i++) {
      let rawBar = 0;
      if (i < 12) {
        // Sub-bass & Bass bands (0..11)
        const subFraction = 1 - i / 12;
        rawBar = this.bass * (0.6 + subFraction * 0.4) + Math.sin(currentSec * 1.8 + i) * 0.06 * e;
      } else if (i < 30) {
        // Mid-range & Vocals (12..29)
        const midFraction = (i - 12) / 18;
        rawBar = this.mid * (0.55 + Math.sin(midFraction * Math.PI) * 0.45) + Math.cos(currentSec * 3.1 + i * 0.3) * 0.05 * e;
      } else {
        // High-range & Air (30..47)
        const highFraction = (i - 30) / 18;
        rawBar = this.treble * (0.5 + highFraction * 0.5) + hihat * 0.3 + Math.sin(currentSec * 8 + i * 0.7) * 0.04 * e;
      }

      // Smooth attack and realistic acoustic decay
      const prev = this.bars[i];
      const target = Math.min(1, Math.max(0.02, rawBar));
      this.bars[i] = prev + (target - prev) * (target > prev ? 0.65 : 0.22);
    }

    return this;
  }
}

export const beat = new BeatEngine();

/** Keeps the shared beat engine tightly synced with audio playback, position, and BPM */
export function useBeatDriver(playing: boolean, bpm: number, seed: number, time = 0) {
  useEffect(() => {
    beat.sync(time, playing, bpm, seed);
  }, [time, playing, bpm, seed]);
}
