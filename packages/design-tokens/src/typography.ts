/**
 * Type roles. Always the platform system font — SF on watchOS/iOS,
 * Roboto on Wear OS. Sizes are pt/dp at the platform default; watches
 * scale these down to their own metrics but keep the hierarchy ratios.
 */
export interface TypeStyle {
  /** "system" resolves to SF/Roboto — never a bundled font. */
  family: "system";
  size: number;
  weight: 400 | 500 | 600 | 700;
  /** Relative to size. */
  lineHeight: number;
  letterSpacing: number;
}

export const typography = {
  /** "Siesta" wordmark / screen titles. */
  title: { family: "system", size: 24, weight: 600, lineHeight: 1.2, letterSpacing: 0.2 },
  /** The duration. Dominant, glanceable on a tiny display. */
  heroNumber: { family: "system", size: 56, weight: 600, lineHeight: 1.0, letterSpacing: -0.5 },
  /** "20 min" unit next to heroNumber, countdown digits. */
  heroUnit: { family: "system", size: 22, weight: 500, lineHeight: 1.0, letterSpacing: 0 },
  body: { family: "system", size: 17, weight: 400, lineHeight: 1.35, letterSpacing: 0 },
  /** Supporting descriptions ("Classic power nap"). */
  supporting: { family: "system", size: 15, weight: 400, lineHeight: 1.3, letterSpacing: 0 },
  /** Primary action label. */
  action: { family: "system", size: 17, weight: 600, lineHeight: 1.2, letterSpacing: 0 },
  caption: { family: "system", size: 13, weight: 400, lineHeight: 1.3, letterSpacing: 0.1 },
} satisfies Record<string, TypeStyle>;

export type TypeRole = keyof typeof typography;
