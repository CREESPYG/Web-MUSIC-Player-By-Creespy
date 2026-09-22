import { useEffect } from "react";

/**
 * High-Precision Musical Audio Beat & Rhythm Engine.
 * Synchronizes visual effects tightly with real track playback time, tempo (BPM),
 * and 4/4 measure structure (downbeat kick on 1, backbeat snare on 2 & 4, 16th sub-pulses).
 *
 * Sync calibration: because the audio stream lives inside a cross-origin YouTube
 * iframe, true beat extraction is impossible — instead the user can lock the
 * visual grid to a song with two knobs:
 *   · tempo (%) — multiply the musical tempo so pulses fire at the song's real rate
 *   · phase (ms) — shift where beat 1 sits so kick/snare land on real downbeats
 * The clock is also drift-corrected: the 500ms UI position poll is absorbed
 * smoothly instead of hard re-anchoring every frame (which caused visible jitter).
 */
class BeatEngine {
  playing = false;
  bpm = 96;
  seed = 1;
  trackTime = 0;
  lastSyncMs = performance.now();
  env = 0;
  lastReadTime = 0;

  // User sync calibration
  tempoMult = 1; // 0.55 .. 1.45
  phaseSec = 0; // -0.25 .. +0.25 seconds of musical time shift

  // Tap-to-lock: real BPM measured from user taps
  private _tapDeltas: number[] = [];
  private _lastTapAt = 0;
  private tapPhaseShift = 0; // unbounded integer-beat alignment from tap-locking

  /** Measure the song's REAL tempo by tapping along. Locks grid to the taps. */
  tapBeat(): { bpm: number; tempoPct: number; phaseMs: number } {
    const now = performance.now();
    if (this._lastTapAt) {
      const delta = (now - this._lastTapAt) / 1000;
      if (delta > 0.12 && delta < 3) {
        this._tapDeltas.push(60 / delta);
        if (this._tapDeltas.length > 8) this._tapDeltas.shift();
      }
    }
    this._lastTapAt = now;

    let bpm = 0;
    if (this._tapDeltas.length >= 2) {
      const sorted = [...this._tapDeltas].sort((a, b) => a - b);
      bpm = sorted[Math.floor(sorted.length / 2)]; // median of instant tempos
    }

    if (bpm >= 45 && bpm <= 200) {
      // Faster/slower visual tempo ⇒ visual grid matches the true song tempo
      this.tempoMult = Math.min(1.45, Math.max(0.55, bpm / this.bpm));

      // Snap phase: make the CURRENT musical instant a whole beat, so the
      // moment you tap a beat registers as an on-beat pulse from here on.
      // Shift lives as an unbounded integer-beat offset (impervious to the
      // ±0.25s UI phase clamp) and keeps the grid aligned for this session.
      const currentSec = this.playing
        ? this.trackTime + Math.max(0, (now - this.lastSyncMs) / 1000)
        : now * 0.001;
      const bps = (this.bpm / 60) * this.tempoMult;
      const fracNow = (currentSec + this.phaseSec) * bps + this.seed * 0.05 + this.tapPhaseShift;
      const rem = fracNow - Math.floor(fracNow);
      this.tapPhaseShift -= rem;
    }

    return {
      bpm: Math.round(bpm),
      tempoPct: Math.round((this.tempoMult - 1) * 100),
      phaseMs: Math.round(this.phaseSec * 1000),
    };
  }

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

  sync(
    trackTimeSec: number,
    isPlaying: boolean,
    bpm: number,
    seed: number,
    tempo = 1,
    phaseMs = 0
  ) {
    const now = performance.now();
    this.playing = isPlaying;

    if (isPlaying && this.playing === this.lastPlayingWasPlaying) {
      // Drift-corrected re-anchor: extrapolate where our clock HAS ALREADY estimated
      // the playback to be, then compare against the polled value.
      const extrap = Math.max(0, this.trackTime + (now - this.lastSyncMs) / 1000);
      const drift = Math.abs(trackTimeSec - extrap);
      if (drift > 0.35) {
        // Real seek / position jump — hard re-anchor keeps bars on the new spot.
        this.trackTime = Math.max(0, trackTimeSec || 0);
      } else {
        // Poll jitter (≤ ~250ms). Absorb it smoothly: keep our continuous clock,
        // nudge it a fraction of the residual so long-term drift never accumulates.
        this.trackTime = extrap + (trackTimeSec - extrap) * 0.18 * Math.min(1, drift / 0.35);
      }
    } else {
      // State change (play/pause/track swap) — anchor cleanly to reported position.
      this.trackTime = Math.max(0, trackTimeSec || 0);
    }

    this.lastPlayingWasPlaying = isPlaying;
    this.lastSyncMs = now;
    this.bpm = bpm > 40 && bpm < 240 ? bpm : 96;
    this.seed = seed || 1;
    this.tempoMult = Math.min(1.45, Math.max(0.55, tempo || 1));
    this.phaseSec = Math.min(0.25, Math.max(-0.25, phaseMs || 0) / 1000);
  }

  private lastPlayingWasPlaying = false;

  setPlaying(p: boolean) {
    this.playing = p;
    this.lastPlayingWasPlaying = false;
    this.lastSyncMs = performance.now();
  }

  setTrack(bpm: number, seed: number, tempo = this.tempoMult, phaseMs = this.phaseSec * 1000) {
    this.bpm = bpm > 40 && bpm < 240 ? bpm : 96;
    this.seed = seed || 1;
    this.tempoMult = Math.min(1.45, Math.max(0.55, tempo || 1));
    this.phaseSec = Math.min(0.25, Math.max(-0.25, phaseMs || 0) / 1000);
    this.lastSyncMs = performance.now();
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

    // Apply user calibration to the musical time axis, then compute the beat grid
    const musicSec = currentSec + this.phaseSec;
    const beatsPerSec = (this.bpm / 60) * this.tempoMult;
    const fractionalBeat = musicSec * beatsPerSec + (this.seed * 0.05) + this.tapPhaseShift;
    const beatIndex = Math.floor(fractionalBeat);
    const beatPhase = fractionalBeat - beatIndex; // 0.0 to 1.0 within beat
    this.beatPhase = beatPhase;
    this.measureBeat = Math.abs(beatIndex % 4); // 0 = Beat 1 (Kick), 1 = Beat 2, 2 = Beat 3, 3 = Beat 4

    // 1. Kick Attack & Decay Envelope (instant on beat 0.0, punchy decay)
    const kickCurve = Math.max(0, 1 - beatPhase * 4.4);
    const kick = kickCurve * kickCurve * e;

    // 2. Downbeat Kick (Beat 1 of measure — heavy bass punch)
    const isDownbeat = this.measureBeat === 0;
    const downbeatVal = isDownbeat ? kick * 1.6 : kick * 0.85;
    this.downbeat = downbeatVal;

    // 3. Snare / Clap Backbeat (Beats 2 & 4 — mid resonance)
    const isBackbeat = this.measureBeat === 1 || this.measureBeat === 3;
    const snare = isBackbeat ? Math.pow(Math.max(0, 1 - beatPhase * 4.4), 2) * e : 0;

    // 4. 16th-note Shimmer & Subdivisions (high frequencies & particles)
    const sub16 = (fractionalBeat * 4) % 1;
    const hihat = Math.pow(Math.max(0, 1 - sub16 * 4.2), 2) * 0.4 * e;

    // Master pulse: instantaneous punch of kick or snare
    this.pulse = Math.max(kick, snare * 0.8);

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
      this.bars[i] = prev + (target - prev) * (target > prev ? 0.7 : 0.22);
    }

    return this;
  }
}

export const beat = new BeatEngine();

/** Keeps the shared beat engine tightly synced with audio playback, position, BPM, and user calibration */
export function useBeatDriver(playing: boolean, bpm: number, seed: number, time = 0, tempo = 1, phaseMs = 0) {
  useEffect(() => {
    beat.sync(time, playing, bpm, seed, tempo, phaseMs);
  }, [time, playing, bpm, seed, tempo, phaseMs]);
}