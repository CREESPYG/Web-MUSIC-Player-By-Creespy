import { describe, it, expect } from "vitest";
import { beat } from "./useBeat";

function warm(now: number) {
  // Ramp the playing envelope to ≈1 before measuring (frames ~40ms apart)
  for (let i = 1; i <= 12; i++) beat.read(now + i * 40);
}

describe("BeatEngine calibration (beat sync)", () => {
  it("tempo multiplier changes when kicks fire (visuals speed up with the song)", () => {
    // Baseline: 120bpm grid → at +0.5s we are exactly on a kick (pulse high)
    beat.sync(0, true, 120, 1, 1.0, 0);
    const baseNow = performance.now() + 4;
    warm(baseNow);
    const kickNow = beat.read(baseNow + 500);
    expect(kickNow.pulse).toBeGreaterThan(0.4);

    // +20% tempo → the same +0.5s now lands mid-beat (kick + snare both decayed)
    beat.sync(0, true, 120, 1, 1.2, 0);
    beat.read(baseNow + 4);
    const midNow = beat.read(baseNow + 500);
    expect(midNow.pulse).toBeLessThan(0.2);
  });

  it("phase offset (ms) slides the beat grid so downbeats can be locked by ear", () => {
    beat.sync(10, true, 120, 1, 1.0, 0);
    const baseNow = performance.now() + 4;
    beat.read(baseNow);
    const basePhase = beat.beatPhase;

    // +250ms at 120bpm (0.25s × 2bpm = 0.5 beat) must advance the phase by half a beat
    beat.sync(10, true, 120, 1, 1.0, 250);
    beat.read(baseNow + 4);
    expect(Math.abs(beat.beatPhase - basePhase)).toBeCloseTo(0.5, 1);
  });

  it("bpm change re-anchors the measure position", () => {
    beat.sync(10, true, 120, 1, 1.0, 0);
    const baseNow = performance.now() + 4;
    beat.read(baseNow);
    expect(beat.beatPhase).toBeCloseTo(0.05, 1);

    beat.sync(10, true, 140, 1, 1.0, 0);
    beat.read(baseNow + 4);
    // 10s × (140/60) ≈ 23.38 → phase ≈ 0.38, clearly off the old grid point
    expect(beat.beatPhase).toBeGreaterThan(0.3);
  });
});