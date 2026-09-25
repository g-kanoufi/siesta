export type WakeIntensity = "gentle" | "normal" | "strong";

export type WakeStep =
  | { kind: "pulse"; intensity: number; durationMs: number }
  | { kind: "pause"; durationMs: number };

/**
 * A wake pattern is data, not code: platforms map pulses to their native
 * haptics (WKInterfaceDevice types on watchOS, VibrationEffect amplitudes on
 * Wear OS), then wait `repeatIntervalMs` and loop until the user responds.
 */
export interface WakePattern {
  steps: readonly WakeStep[];
  repeatIntervalMs: number;
}

export const WAKE_PATTERNS: Record<WakeIntensity, WakePattern> = {
  gentle: {
    steps: [
      { kind: "pulse", intensity: 0.35, durationMs: 120 },
      { kind: "pause", durationMs: 900 },
      { kind: "pulse", intensity: 0.45, durationMs: 140 },
      { kind: "pause", durationMs: 700 },
      { kind: "pulse", intensity: 0.55, durationMs: 160 },
      { kind: "pause", durationMs: 1400 },
    ],
    repeatIntervalMs: 4000,
  },
  normal: {
    steps: [
      { kind: "pulse", intensity: 0.5, durationMs: 140 },
      { kind: "pause", durationMs: 600 },
      { kind: "pulse", intensity: 0.65, durationMs: 160 },
      { kind: "pause", durationMs: 450 },
      { kind: "pulse", intensity: 0.8, durationMs: 200 },
      { kind: "pause", durationMs: 900 },
    ],
    repeatIntervalMs: 3000,
  },
  strong: {
    steps: [
      { kind: "pulse", intensity: 0.65, durationMs: 160 },
      { kind: "pause", durationMs: 350 },
      { kind: "pulse", intensity: 0.85, durationMs: 200 },
      { kind: "pause", durationMs: 250 },
      { kind: "pulse", intensity: 1.0, durationMs: 280 },
      { kind: "pulse", intensity: 1.0, durationMs: 200 },
      { kind: "pause", durationMs: 500 },
    ],
    repeatIntervalMs: 2400,
  },
};

export function patternDurationMs(pattern: WakePattern): number {
  return pattern.steps.reduce(
    (sum, step) => sum + (step.kind === "pulse" ? step.durationMs : step.durationMs),
    0,
  );
}
