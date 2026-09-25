import { accessibility } from "../src/accessibility";
import { colors, type ColorScheme } from "../src/colors";
import { ambient, motion } from "../src/motion";
import type { MotionPrimitive } from "../src/motion";
import { spacing } from "../src/spacing";
import { typography } from "../src/typography";

/** WCAG 2.x relative luminance + contrast — accessibility by construction. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const schemes: Array<["light" | "dark", ColorScheme]> = [
  ["light", colors.light],
  ["dark", colors.dark],
];

describe("color tokens", () => {
  it.each(schemes)("%s: body text meets AA on every surface", (name, s) => {
    for (const surface of [s.background, s.surface, s.surfaceElevated]) {
      expect(contrast(s.textPrimary, surface)).toBeGreaterThanOrEqual(
        accessibility.contrast.normalTextMin,
      );
      expect(contrast(s.textSecondary, surface)).toBeGreaterThanOrEqual(
        accessibility.contrast.normalTextMin,
      );
    }
  });

  it.each(schemes)("%s: tertiary text stays legible at large size", (_, s) => {
    expect(contrast(s.textTertiary, s.background)).toBeGreaterThanOrEqual(
      accessibility.contrast.largeTextMin,
    );
  });

  it.each(schemes)("%s: accent works on background and with its label", (_, s) => {
    expect(contrast(s.accent, s.background)).toBeGreaterThanOrEqual(
      accessibility.contrast.largeTextMin,
    );
    expect(contrast(s.onAccent, s.accent)).toBeGreaterThanOrEqual(
      accessibility.contrast.normalTextMin,
    );
  });

  it.each(schemes)("%s: status colors are distinguishable on background", (_, s) => {
    for (const status of [s.success, s.warning, s.danger]) {
      expect(contrast(status, s.background)).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("dark mode is designed — warm charcoal, never pure black", () => {
    expect(colors.dark.background).not.toBe("#000000");
    expect(luminance(colors.dark.background)).toBeLessThan(0.03);
    expect(colors.dark.scrim).not.toBe(colors.dark.background);
  });
});

describe("motion tokens", () => {
  it("every primitive defines a reduced-motion alternative", () => {
    for (const m of Object.values<MotionPrimitive>(motion)) {
      expect(m.reducedMotion).toBeDefined();
      if (m.reducedMotion.kind === "fade") {
        expect(m.reducedMotion.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it("springs are physically sane: positive stiffness, damping, mass", () => {
    for (const m of Object.values<MotionPrimitive>(motion)) {
      if (m.spring) {
        expect(m.spring.stiffness).toBeGreaterThan(0);
        expect(m.spring.damping).toBeGreaterThan(0);
        expect(m.spring.mass).toBeGreaterThan(0);
      }
    }
  });

  it("ambient motion is subtle and always honors Reduce Motion", () => {
    expect(ambient.sway.amplitudeDegrees).toBeLessThanOrEqual(2);
    expect(ambient.breathe.amplitudeScale).toBeLessThanOrEqual(0.05);
    for (const a of Object.values(ambient)) {
      expect(a.disabledUnderReduceMotion).toBe(true);
    }
  });
});

describe("typography tokens", () => {
  it("hero number dominates the hierarchy", () => {
    expect(typography.heroNumber.size).toBeGreaterThan(typography.title.size);
    expect(typography.title.size).toBeGreaterThan(typography.body.size);
  });

  it("uses system fonts only", () => {
    for (const style of Object.values(typography)) {
      expect(style.family).toBe("system");
    }
  });
});

describe("spacing tokens", () => {
  it("keeps to the 4pt grid", () => {
    for (const [name, v] of Object.entries(spacing)) {
      expect(v % 2).toBe(0);
    }
  });
});

describe("accessibility tokens", () => {
  it("never lets touch targets shrink below platform minimums", () => {
    expect(accessibility.touchTarget.minPt).toBeGreaterThanOrEqual(44);
    expect(accessibility.touchTarget.minDp).toBeGreaterThanOrEqual(48);
  });
});
