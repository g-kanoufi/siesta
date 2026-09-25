export const MIN_NAP_MINUTES = 5;
export const MAX_NAP_MINUTES = 120;
export const DEFAULT_DURATION_MINUTES = 20;

export interface NapDurationPreset {
  minutes: number;
  id: string;
  shortLabel: string;
  /** Neutral copy. No medical claims — describe the nap, not the outcome. */
  description: string;
  recommended?: true;
}

export const NAP_DURATION_PRESETS: readonly NapDurationPreset[] = [
  { minutes: 10, id: "quick-reset", shortLabel: "10 min", description: "Quick reset" },
  { minutes: 15, id: "short-break", shortLabel: "15 min", description: "Short break" },
  {
    minutes: 20,
    id: "power-nap",
    shortLabel: "20 min",
    description: "Classic power nap",
    recommended: true,
  },
  { minutes: 25, id: "extended-rest", shortLabel: "25 min", description: "Extended rest" },
  { minutes: 30, id: "longer-recharge", shortLabel: "30 min", description: "Longer recharge" },
  { minutes: 45, id: "deep-rest", shortLabel: "45 min", description: "Deep rest" },
  { minutes: 60, id: "full-hour", shortLabel: "60 min", description: "A full hour" },
  { minutes: 90, id: "sleep-cycle", shortLabel: "90 min", description: "Full sleep cycle" },
];

export function presetFor(minutes: number): NapDurationPreset | undefined {
  return NAP_DURATION_PRESETS.find((p) => p.minutes === minutes);
}

/** Presets are curated; any whole-minute duration in range is also allowed. */
export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_NAP_MINUTES &&
    minutes <= MAX_NAP_MINUTES
  );
}
