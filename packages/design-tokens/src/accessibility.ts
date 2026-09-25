/**
 * Accessibility tokens. Values come from platform HIG/Material guidance;
 * tests enforce them as floor values, so nobody can shrink a target.
 */
export const accessibility = {
  touchTarget: {
    /** Apple HIG minimum. */
    minPt: 44,
    /** Material/Wear OS minimum. */
    minDp: 48,
  },
  contrast: {
    /** WCAG AA for body text. */
    normalTextMin: 4.5,
    /** WCAG AA for large text (hero number, action label). */
    largeTextMin: 3.0,
  },
  /**
   * States must never be color-only: waiting/sleeping/waking always pair
   * color with an icon or label change.
   */
  requireNonColorStatus: true,
} as const;
