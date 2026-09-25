import {
  DEFAULT_FAIL_SAFE_GRACE_MINUTES,
  computeFailSafeWakeAtMs,
  computeWakeAtMs,
  nextDeadlineMs,
  remainingMs,
} from "../src/wake";
import type { NapSessionSnapshot } from "../src/types";

const iso = (s: string) => Date.parse(s);

const session = (over: Partial<NapSessionSnapshot>): NapSessionSnapshot => ({
  id: "s1",
  selectedDurationMinutes: 20,
  state: "sleeping",
  armedAtMs: null,
  sleepDetectedAtMs: null,
  expectedWakeAtMs: null,
  failSafeWakeAtMs: null,
  ...over,
});

describe("computeWakeAtMs", () => {
  it("wakes exactly duration after detected sleep", () => {
    const detected = iso("2026-09-25T12:00:00Z");
    expect(computeWakeAtMs(detected, 20)).toBe(iso("2026-09-25T12:20:00Z"));
  });

  it("crosses midnight correctly", () => {
    const detected = iso("2026-09-25T23:55:00Z");
    expect(computeWakeAtMs(detected, 20)).toBe(iso("2026-09-26T00:15:00Z"));
  });

  it("is DST-immune because math is in epoch milliseconds", () => {
    // EU DST ends 2026-10-25: clocks fall back at 03:00 CEST → 02:00 CET.
    // A 20-minute nap starting 15 min before fallback must wake after
    // exactly 20 elapsed minutes — not one wall-clock 20 min.
    const detected = iso("2026-10-25T00:45:00Z"); // 02:45 CEST
    const wake = computeWakeAtMs(detected, 20);
    expect(wake - detected).toBe(20 * 60_000);
    expect(new Date(wake).toISOString()).toBe("2026-10-25T01:05:00.000Z");
  });

  it("handles a 90-minute cycle nap", () => {
    const detected = iso("2026-09-25T14:00:00Z");
    expect(new Date(computeWakeAtMs(detected, 90)).toISOString()).toBe(
      "2026-09-25T15:30:00.000Z",
    );
  });
});

describe("computeFailSafeWakeAtMs", () => {
  it("caps the wait at armedAt + duration + grace", () => {
    const armed = iso("2026-09-25T12:00:00Z");
    expect(computeFailSafeWakeAtMs(armed, 20)).toBe(
      iso("2026-09-25T12:35:00Z"),
    );
    expect(DEFAULT_FAIL_SAFE_GRACE_MINUTES).toBe(15);
  });

  it("honours a custom grace period", () => {
    const armed = iso("2026-09-25T12:00:00Z");
    expect(computeFailSafeWakeAtMs(armed, 20, 5)).toBe(
      iso("2026-09-25T12:25:00Z"),
    );
  });
});

describe("nextDeadlineMs", () => {
  const t = iso("2026-09-25T12:00:00Z");

  it("is the fail-safe while waiting for sleep", () => {
    const s = session({ state: "waiting_for_sleep", failSafeWakeAtMs: t });
    expect(nextDeadlineMs(s)).toBe(t);
  });

  it("is the expected wake while sleeping", () => {
    const s = session({ state: "sleeping", expectedWakeAtMs: t + 5_000 });
    expect(nextDeadlineMs(s)).toBe(t + 5_000);
  });

  it.each(["idle", "selecting_duration", "completed", "cancelled", "error"] as const)(
    "is null while %s",
    (state) => {
      expect(nextDeadlineMs(session({ state }))).toBeNull();
    },
  );

  it("is null while waking — the deadline already fired", () => {
    expect(nextDeadlineMs(session({ state: "waking" }))).toBeNull();
  });
});

describe("remainingMs", () => {
  it("counts down from the expected wake", () => {
    const s = session({
      state: "sleeping",
      expectedWakeAtMs: iso("2026-09-25T12:20:00Z"),
    });
    expect(remainingMs(s, iso("2026-09-25T12:05:00Z"))).toBe(15 * 60_000);
  });

  it("never goes negative", () => {
    const s = session({
      state: "sleeping",
      expectedWakeAtMs: iso("2026-09-25T12:20:00Z"),
    });
    expect(remainingMs(s, iso("2026-09-25T12:30:00Z"))).toBe(0);
  });

  it("is null when there is no active deadline", () => {
    expect(remainingMs(session({ state: "idle" }), 0)).toBeNull();
  });
});
