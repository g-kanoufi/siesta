import {
  DEFAULT_DURATION_MINUTES,
  MAX_NAP_MINUTES,
  MIN_NAP_MINUTES,
  NAP_DURATION_PRESETS,
  isValidDuration,
  presetFor,
} from "../src/durations";

describe("nap duration presets", () => {
  it("offers the brief's presets in ascending order", () => {
    expect(NAP_DURATION_PRESETS.map((p) => p.minutes)).toEqual([
      10, 15, 20, 25, 30, 45, 60, 90,
    ]);
  });

  it("recommends exactly one duration — the classic 20-minute power nap", () => {
    const recommended = NAP_DURATION_PRESETS.filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0]!.minutes).toBe(20);
    expect(DEFAULT_DURATION_MINUTES).toBe(20);
  });

  it("gives every preset a neutral, non-medical description", () => {
    for (const p of NAP_DURATION_PRESETS) {
      expect(p.shortLabel).toBe(`${p.minutes} min`);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.id).toMatch(/^[a-z-]+$/);
    }
  });

  it("looks presets up by minutes", () => {
    expect(presetFor(90)?.id).toBe("sleep-cycle");
    expect(presetFor(7)).toBeUndefined();
  });
});

describe("isValidDuration", () => {
  it.each([MIN_NAP_MINUTES, 20, 37, MAX_NAP_MINUTES])("accepts %d", (m) => {
    expect(isValidDuration(m)).toBe(true);
  });

  it.each([0, -5, MIN_NAP_MINUTES - 1, MAX_NAP_MINUTES + 1, 20.5, NaN])(
    "rejects %d",
    (m) => {
      expect(isValidDuration(m)).toBe(false);
    },
  );
});
