import { useEffect } from "react";

/**
 * High-Precision Audio Spectrum & Frequency Beat Engine.
 * Supports BOTH:
 * 1. Real Hardware Web Audio AnalyserNode (FFT byte frequency data)
 * 2. High-Fidelity Organic Audio DSP Synthesizer that pulses to musical rhythm,
 *    volume, playback rate, transient attacks, and multi-band frequency distributions.
 */
class BeatEngine {
  playing = false;
  bpm = 110;
  seed = 1;
  trackTime = 0;
  lastSyncMs = performance.now();
  env = 0;
  lastReadTime = 0;
  volume = 1;

  // Real-time audio beat telemetry
  level = 0;
  bass = 0;
  mid = 0;
  treble = 0;
  pulse = 0;
  downbeat = 0;
  beatPhase = 0;
  measureBeat = 0;
  bars = new Float32Array(64);

  // Real Web Audio API Analyser support
  private analyser: AnalyserNode | null = null;
  private fftData: Uint8Array<ArrayBuffer> | null = null;

  connectAnalyser(node: AnalyserNode) {
    this.analyser = node;
    this.fftData = new Uint8Array(node.frequencyBinCount);
  }

  disconnectAnalyser() {
    this.analyser = null;
    this.fftData = null;
  }

  sync(trackTimeSec: number, isPlaying: boolean, bpm: number, seed: number, volume = 1) {
    this.trackTime = Math.max(0, trackTimeSec || 0);
    this.lastSyncMs = performance.now();
    this.playing = isPlaying;
    this.bpm = bpm > 40 && bpm < 240 ? bpm : 110;
    this.seed = seed || 1;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  setPlaying(p: boolean) {
    this.playing = p;
    this.lastSyncMs = performance.now();
  }

  /** Frame deduplication timestamp */
  private _cachedAt = -1;

  read(nowMs: number) {
    if (Math.abs(nowMs - this._cachedAt) < 2) return this;
    this._cachedAt = nowMs;

    const dt = this.lastReadTime ? Math.min(0.08, (nowMs - this.lastReadTime) / 1000) : 0.016;
    this.lastReadTime = nowMs;

    // Smooth envelope: reaches 1.0 when playing, drops to 0.05 when paused
    const targetEnv = this.playing ? this.volume : 0.05;
    const k = 1 - Math.exp(-dt * (this.playing ? 6.0 : 2.5));
    this.env += (targetEnv - this.env) * k;
    const e = this.env;

    // IF Real Web Audio Analyser is connected, use genuine FFT frequency data!
    if (this.analyser && this.fftData) {
      this.analyser.getByteFrequencyData(this.fftData);
      const binCount = this.fftData.length;
      const numBars = this.bars.length;

      let sumBass = 0, sumMid = 0, sumTreble = 0;
      const bassCount = Math.floor(binCount * 0.15);
      const midCount = Math.floor(binCount * 0.45);
      const trebleCount = binCount - bassCount - midCount;

      for (let i = 0; i < binCount; i++) {
        const val = this.fftData[i] / 255;
        if (i < bassCount) sumBass += val;
        else if (i < bassCount + midCount) sumMid += val;
        else sumTreble += val;
      }

      this.bass = bassCount > 0 ? sumBass / bassCount : 0;
      this.mid = midCount > 0 ? sumMid / midCount : 0;
      this.treble = trebleCount > 0 ? sumTreble / trebleCount : 0;
      this.level = this.bass * 0.5 + this.mid * 0.35 + this.treble * 0.15;
      this.pulse = Math.max(this.bass * 1.4, this.level);

      // Resample FFT bins to our 64 visualizer bars
      for (let i = 0; i < numBars; i++) {
        const binIdx = Math.floor((i / numBars) * (binCount * 0.65));
        const val = (this.fftData[binIdx] / 255) * e;
        const prev = this.bars[i];
        this.bars[i] = prev + (val - prev) * (val > prev ? 0.75 : 0.28);
      }

      return this;
    }

    // High-Fidelity Acoustic DSP Simulation when direct FFT isn't available
    let currentSec = this.trackTime;
    if (this.playing) {
      const elapsedSinceSync = Math.max(0, (nowMs - this.lastSyncMs) / 1000);
      currentSec += elapsedSinceSync;
    } else {
      currentSec = nowMs * 0.001;
    }

    // Exact musical beat calculation
    const beatsPerSec = this.bpm / 60;
    const fractionalBeat = currentSec * beatsPerSec + (this.seed * 0.07);
    const beatIndex = Math.floor(fractionalBeat);
    const beatPhase = fractionalBeat - beatIndex;
    this.beatPhase = beatPhase;
    this.measureBeat = Math.abs(beatIndex % 4);

    // 1. Kick Attack & Decay (punchy, deep sub-bass thump)
    const kickCurve = Math.max(0, 1 - beatPhase * 3.2);
    const kick = Math.pow(kickCurve, 2) * e;

    // 2. Downbeat Kick (Beat 1 of measure)
    const isDownbeat = this.measureBeat === 0;
    const downbeatVal = isDownbeat ? kick * 1.6 : kick * 0.9;
    this.downbeat = downbeatVal;

    // 3. Snare / Clap (Beats 2 & 4)
    const isBackbeat = this.measureBeat === 1 || this.measureBeat === 3;
    const snare = isBackbeat ? Math.pow(Math.max(0, 1 - beatPhase * 3.6), 2) * e : 0;

    // 4. 16th-note Hi-hats
    const sub16 = (fractionalBeat * 4) % 1;
    const hihat = Math.pow(Math.max(0, 1 - sub16 * 4.0), 2) * 0.45 * e;

    this.pulse = Math.max(kick * 1.2, snare * 0.85);

    // Frequency bands
    this.bass = Math.min(1, Math.max(0.05, 0.15 + downbeatVal * 0.95 + Math.sin(currentSec * 2.4) * 0.08 * e));
    this.mid = Math.min(1, Math.max(0.05, 0.12 + snare * 0.85 + kick * 0.3 + Math.cos(currentSec * 3.8) * 0.06 * e));
    this.treble = Math.min(1, Math.max(0.05, 0.1 + hihat * 0.9 + Math.sin(currentSec * 7.2) * 0.05 * e));
    this.level = Math.min(1, this.bass * 0.5 + this.mid * 0.32 + this.treble * 0.18);

    // 64-band vivid frequency spectrum
    const N = this.bars.length;
    for (let i = 0; i < N; i++) {
      let rawBar = 0;

      if (i < 16) {
        // Heavy Sub-Bass & Bass (0..15)
        const subFrac = 1 - i / 16;
        const bassJitter = Math.sin(currentSec * 4.5 + i * 0.8) * 0.12 * e;
        rawBar = this.bass * (0.7 + subFrac * 0.55) + bassJitter;
      } else if (i < 42) {
        // Warm Mid-Range & Melodies (16..41)
        const midFrac = (i - 16) / 26;
        const midJitter = Math.cos(currentSec * 5.2 + i * 0.4) * 0.1 * e;
        rawBar = this.mid * (0.6 + Math.sin(midFrac * Math.PI) * 0.55) + midJitter;
      } else {
        // Sparkling Highs & Cymbals (42..63)
        const highFrac = (i - 42) / 22;
        const highJitter = Math.sin(currentSec * 9.5 + i * 1.1) * 0.08 * e;
        rawBar = this.treble * (0.55 + highFrac * 0.6) + hihat * 0.45 + highJitter;
      }

      // Smooth organic physics (fast attack, natural acoustic decay)
      const prev = this.bars[i];
      const target = Math.min(1, Math.max(0.02, rawBar));
      this.bars[i] = prev + (target - prev) * (target > prev ? 0.78 : 0.22);
    }

    return this;
  }
}

export const beat = new BeatEngine();

/** Keeps the shared beat engine tightly synced with audio playback, position, BPM, and volume */
export function useBeatDriver(playing: boolean, bpm: number, seed: number, time = 0, volume = 1) {
  useEffect(() => {
    beat.sync(time, playing, bpm, seed, volume);
  }, [time, playing, bpm, seed, volume]);
}
