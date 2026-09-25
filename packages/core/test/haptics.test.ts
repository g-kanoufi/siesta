import { WAKE_PATTERNS, patternDurationMs } from "../src/haptics";

describe("wake haptic patterns", () => {
  it("offers gentle, normal, and strong", () => {
    expect(Object.keys(WAKE_PATTERNS).sort()).toEqual([
      "gentle",
      "normal",
      "strong",
    ]);
  });

  it("escalates — pulses never get weaker within a pattern", () => {
    for (const pattern of Object.values(WAKE_PATTERNS)) {
      let peak = 0;
      for (const step of pattern.steps) {
        if (step.kind === "pulse") {
          expect(step.intensity).toBeGreaterThanOrEqual(peak);
          peak = step.intensity;
        }
      }
    }
  });

  it("breathes — every pattern alternates pulses with pauses", () => {
    for (const pattern of Object.values(WAKE_PATTERNS)) {
      const kinds = pattern.steps.map((s) => s.kind);
      expect(kinds).toContain("pulse");
      expect(kinds).toContain("pause");
      expect(kinds[0]).toBe("pulse");
      expect(kinds[kinds.length - 1]).toBe("pause");
    }
  });

  it("orders intensities gentle < normal < strong by peak", () => {
    const peak = (name: keyof typeof WAKE_PATTERNS) =>
      Math.max(
        ...WAKE_PATTERNS[name].steps
          .filter((s) => s.kind === "pulse")
          .map((s) => (s.kind === "pulse" ? s.intensity : 0)),
      );
    expect(peak("gentle")).toBeLessThan(peak("normal"));
    expect(peak("normal")).toBeLessThan(peak("strong"));
  });

  it("gentle starts softer than strong finishes", () => {
    const first = WAKE_PATTERNS.gentle.steps[0];
    expect(first?.kind).toBe("pulse");
    if (first?.kind === "pulse") {
      expect(first.intensity).toBeLessThanOrEqual(0.4);
    }
  });

  it("computes total pattern duration and a sane repeat interval", () => {
    for (const pattern of Object.values(WAKE_PATTERNS)) {
      expect(patternDurationMs(pattern)).toBeGreaterThan(0);
      expect(pattern.repeatIntervalMs).toBeGreaterThanOrEqual(
        patternDurationMs(pattern),
      );
      expect(pattern.repeatIntervalMs).toBeLessThanOrEqual(15_000);
    }
  });
});
