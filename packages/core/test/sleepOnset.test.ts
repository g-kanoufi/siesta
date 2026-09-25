import {
  DEFAULT_ONSET_CONFIG,
  SleepOnsetDetector,
} from "../src/sleepOnset";
import type { PhysioSample } from "../src/sleepOnset";

const MIN = 60_000;
const T0 = 1_800_000_000_000; // arbitrary session start, epoch ms

/** Feed one sample every `stepMs` from `fromMs` to `toMs` inclusive. */
function feedRange(
  d: SleepOnsetDetector,
  fromMs: number,
  toMs: number,
  sample: Omit<PhysioSample, "atMs">,
  stepMs = 10_000,
) {
  for (let t = fromMs; t <= toMs; t += stepMs) {
    d.feed({ atMs: t, ...sample });
  }
}

const fast = {
  baselineWindowMs: 2 * MIN,
  confirmationWindowMs: 3 * MIN,
  heartRateDropFraction: 0.08,
  motionThreshold: 0.05,
};

describe("SleepOnsetDetector", () => {
  it("detects onset when HR drops below baseline and stays calm", () => {
    const d = new SleepOnsetDetector(fast);

    // Awake baseline: HR ~70, some motion.
    feedRange(d, T0, T0 + 2 * MIN, { heartRate: 70, motion: 0.2 });
    expect(d.onsetAtMs).toBeNull();

    // User drifts off: HR 60 (< 70 × 0.92 = 64.4), still.
    feedRange(d, T0 + 2 * MIN + 10_000, T0 + 5 * MIN + 10_000, {
      heartRate: 60,
      motion: 0.01,
    });

    // Confirmation window = 3 min → qualifies from first calm sample.
    expect(d.onsetAtMs).toBe(T0 + 2 * MIN + 10_000);
  });

  it("does not fire during the confirmation window", () => {
    const d = new SleepOnsetDetector(fast);
    feedRange(d, T0, T0 + 2 * MIN, { heartRate: 70, motion: 0.2 });
    feedRange(d, T0 + 2 * MIN + 10_000, T0 + 4 * MIN, {
      heartRate: 60,
      motion: 0.01,
    });
    expect(d.onsetAtMs).toBeNull();
  });

  it("resets the window when the user moves mid-confirmation", () => {
    const d = new SleepOnsetDetector(fast);
    feedRange(d, T0, T0 + 2 * MIN, { heartRate: 70, motion: 0.2 });

    // Calm for ~2 min, then a roll-over at T0+4min, then calm again.
    feedRange(d, T0 + 2 * MIN + 10_000, T0 + 4 * MIN - 10_000, {
      heartRate: 60,
      motion: 0.01,
    });
    d.feed({ atMs: T0 + 4 * MIN, heartRate: 62, motion: 0.4 });
    feedRange(d, T0 + 4 * MIN + 10_000, T0 + 7 * MIN + 10_000, {
      heartRate: 60,
      motion: 0.01,
    });

    // Window restarted at the sample after the spike.
    expect(d.onsetAtMs).toBe(T0 + 4 * MIN + 10_000);
  });

  it("never detects if HR stays at baseline", () => {
    const d = new SleepOnsetDetector(fast);
    feedRange(d, T0, T0 + 10 * MIN, { heartRate: 70, motion: 0.01 });
    expect(d.onsetAtMs).toBeNull();
  });

  it("falls back to motion-only when no HR samples exist", () => {
    const d = new SleepOnsetDetector(fast);
    feedRange(d, T0, T0 + 2 * MIN, { motion: 0.3 });
    feedRange(d, T0 + 2 * MIN + 10_000, T0 + 6 * MIN, { motion: 0.01 });
    expect(d.onsetAtMs).toBe(T0 + 2 * MIN + 10_000);
  });

  it("requires at least one calm minute, so a single spike after onset doesn't matter", () => {
    const d = new SleepOnsetDetector(fast);
    feedRange(d, T0, T0 + 2 * MIN, { heartRate: 70, motion: 0.1 });
    feedRange(d, T0 + 2 * MIN + 10_000, T0 + 5 * MIN + 10_000, {
      heartRate: 60,
      motion: 0.01,
    });
    const onset = d.onsetAtMs;
    expect(onset).toBe(T0 + 2 * MIN + 10_000);

    // Latch: later movement does not un-detect.
    d.feed({ atMs: T0 + 6 * MIN, heartRate: 75, motion: 0.5 });
    expect(d.onsetAtMs).toBe(onset);
  });

  it("reset() returns to baseline collection", () => {
    const d = new SleepOnsetDetector(fast);
    feedRange(d, T0, T0 + 2 * MIN, { heartRate: 70, motion: 0.2 });
    feedRange(d, T0 + 2 * MIN + 10_000, T0 + 6 * MIN, {
      heartRate: 60,
      motion: 0.01,
    });
    expect(d.onsetAtMs).not.toBeNull();

    d.reset();
    expect(d.onsetAtMs).toBeNull();
  });

  it("documents sane defaults", () => {
    expect(DEFAULT_ONSET_CONFIG.baselineWindowMs).toBe(2 * MIN);
    expect(DEFAULT_ONSET_CONFIG.confirmationWindowMs).toBe(3 * MIN);
    expect(DEFAULT_ONSET_CONFIG.heartRateDropFraction).toBe(0.08);
    expect(DEFAULT_ONSET_CONFIG.motionThreshold).toBe(0.05);
  });
});
