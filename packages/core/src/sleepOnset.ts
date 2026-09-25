import type { EpochMs } from "./types";

/**
 * One physiological sample. `heartRate` in bpm, `motion` as RMS acceleration
 * (g). Either may be absent — the detector degrades to whatever is available.
 */
export interface PhysioSample {
  atMs: EpochMs;
  heartRate?: number;
  motion?: number;
}

export interface SleepOnsetConfig {
  /** How long after arming we learn the user's awake baseline HR. */
  baselineWindowMs: number;
  /** Calm must be sustained this long before onset is declared. */
  confirmationWindowMs: number;
  /** Required HR drop below baseline, as a fraction (0.08 = 8%). */
  heartRateDropFraction: number;
  /** Motion RMS (g) above which the user is considered moving. */
  motionThreshold: number;
}

export const DEFAULT_ONSET_CONFIG: SleepOnsetConfig = {
  baselineWindowMs: 120_000,
  confirmationWindowMs: 180_000,
  heartRateDropFraction: 0.08,
  motionThreshold: 0.05,
};

/**
 * Sleep-onset heuristic. This is an *estimate* — no platform exposes true
 * sleep onset — and all copy must say so.
 *
 * Phases:
 *   baseline  — first `baselineWindowMs` of samples establish awake HR
 *   watching  — a sample qualifies when HR ≤ baseline·(1−drop) and motion
 *               ≤ threshold (motion-only if HR is unavailable)
 *   confirmed — qualification sustained for `confirmationWindowMs`; onset is
 *               reported at the START of the quiet window, not at confirm
 *               time, so the countdown credits the moment they drifted off
 *               rather than the moment we noticed.
 *
 * Motion spikes or HR rebounds reset the qualifying window. Detection
 * latches once fired. Samples are assumed to arrive in time order.
 */
export class SleepOnsetDetector {
  private readonly config: SleepOnsetConfig;
  private sessionStartMs: EpochMs | null = null;
  private baselineSum = 0;
  private baselineCount = 0;
  private baselineHr: number | null = null;
  private qualifyingStartMs: EpochMs | null = null;
  private onset: EpochMs | null = null;

  constructor(config: Partial<SleepOnsetConfig> = {}) {
    this.config = { ...DEFAULT_ONSET_CONFIG, ...config };
  }

  get onsetAtMs(): EpochMs | null {
    return this.onset;
  }

  feed(sample: PhysioSample): void {
    if (this.onset !== null) return;
    if (this.sessionStartMs === null) this.sessionStartMs = sample.atMs;

    const inBaseline =
      sample.atMs - this.sessionStartMs < this.config.baselineWindowMs;

    if (inBaseline) {
      if (sample.heartRate !== undefined) {
        this.baselineSum += sample.heartRate;
        this.baselineCount += 1;
      }
      return;
    }

    if (this.baselineHr === null && this.baselineCount > 0) {
      this.baselineHr = this.baselineSum / this.baselineCount;
    }

    const hrOk =
      sample.heartRate === undefined
        ? this.baselineHr === null // motion-only mode
        : this.baselineHr !== null &&
          sample.heartRate <= this.baselineHr * (1 - this.config.heartRateDropFraction);
    const motionOk =
      sample.motion === undefined || sample.motion <= this.config.motionThreshold;

    if (hrOk && motionOk) {
      if (this.qualifyingStartMs === null) {
        this.qualifyingStartMs = sample.atMs;
      }
      if (
        sample.atMs - this.qualifyingStartMs >=
        this.config.confirmationWindowMs
      ) {
        this.onset = this.qualifyingStartMs;
      }
    } else {
      this.qualifyingStartMs = null;
    }
  }

  reset(): void {
    this.sessionStartMs = null;
    this.baselineSum = 0;
    this.baselineCount = 0;
    this.baselineHr = null;
    this.qualifyingStartMs = null;
    this.onset = null;
  }
}
