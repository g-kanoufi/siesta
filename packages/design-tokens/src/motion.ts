/**
 * The Siesta motion language (brief §15). Every animation in every platform
 * implementation must come from this table — no ad-hoc constants.
 *
 * Springs use the classic stiffness/damping/mass triple (Reanimated, SwiftUI
 * `interpolatingSpring`, and Compose `spring` all accept equivalents).
 *
 * `reducedMotion` is the required accessibility alternative: movement is
 * replaced by a short opacity/state change. Motion is never the only channel
 * carrying meaning.
 */

export interface SpringParams {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
}

export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface TimingParams {
  type: "timing";
  durationMs: number;
  easing: EasingName;
}

export interface ReducedMotion {
  /** "fade" = opacity-only transition; "none" = instant state change. */
  kind: "fade" | "none";
  durationMs: number;
}

export interface MotionPrimitive {
  spring?: SpringParams;
  timing?: TimingParams;
  reducedMotion: ReducedMotion;
}

const fadeOnly = (durationMs = 150): ReducedMotion => ({
  kind: "fade",
  durationMs,
});

export const motion = {
  /** Hammock come-to-rest, sheet transitions. Slow settle, no overshoot. */
  springGentle: {
    spring: { type: "spring", stiffness: 120, damping: 16, mass: 1 },
    reducedMotion: fadeOnly(200),
  },
  /** Default object response — selection, layout shifts. */
  springStandard: {
    spring: { type: "spring", stiffness: 200, damping: 20, mass: 1 },
    reducedMotion: fadeOnly(150),
  },
  /** Button press, picker snap. Tight, tactile. */
  springSnappy: {
    spring: { type: "spring", stiffness: 400, damping: 26, mass: 0.9 },
    reducedMotion: fadeOnly(100),
  },
  /** Rare, playful overshoot — hammock dip on Start. */
  springBounce: {
    spring: { type: "spring", stiffness: 260, damping: 13, mass: 1 },
    reducedMotion: fadeOnly(150),
  },
  fadeIn: {
    timing: { type: "timing", durationMs: 220, easing: "easeOut" },
    reducedMotion: fadeOnly(120),
  },
  fadeOut: {
    timing: { type: "timing", durationMs: 160, easing: "easeIn" },
    reducedMotion: { kind: "none", durationMs: 0 },
  },
  /** Enter: scale 0.94→1 + fade. */
  scaleIn: {
    spring: { type: "spring", stiffness: 240, damping: 22, mass: 1 },
    reducedMotion: fadeOnly(150),
  },
  scaleOut: {
    timing: { type: "timing", durationMs: 140, easing: "easeIn" },
    reducedMotion: { kind: "none", durationMs: 0 },
  },
  /** Touch compression 0.96 — every pressable control. */
  press: {
    spring: { type: "spring", stiffness: 500, damping: 30, mass: 0.8 },
    reducedMotion: { kind: "none", durationMs: 0 },
  },
} satisfies Record<string, MotionPrimitive>;

export type MotionName = keyof typeof motion;

/**
 * Continuous ambient motion for the hammock metaphor. Deliberately tiny
 * amplitudes — felt, not watched. All disabled under Reduce Motion.
 */
export const ambient = {
  /** Waiting for sleep — breathing stillness. */
  breathe: { periodMs: 4200, amplitudeScale: 0.018, disabledUnderReduceMotion: true },
  /** Sleeping — a slow hammock sway. */
  sway: { periodMs: 6200, amplitudeDegrees: 1.6, disabledUnderReduceMotion: true },
  /** Waking — the hammock rises and settles. */
  rise: { spring: { type: "spring", stiffness: 90, damping: 12, mass: 1 }, disabledUnderReduceMotion: true },
} as const;
