import { NapSessionManager } from "../src/session";
import {
  InMemorySessionStore,
  ManualClock,
  MockSleepDetectionService,
  RecordingAlarmScheduler,
  RecordingHaptics,
} from "../src/mocks";
import { WAKE_PATTERNS } from "../src/haptics";
import type { NapSessionSnapshot } from "../src/types";

const iso = (s: string) => Date.parse(s);
const MIN = 60_000;
const T0 = iso("2026-09-25T12:00:00Z");

function makeDeps(now = T0) {
  return {
    clock: new ManualClock(now),
    sleep: new MockSleepDetectionService(),
    scheduler: new RecordingAlarmScheduler(),
    haptics: new RecordingHaptics(),
    store: new InMemorySessionStore(),
    newId: (() => {
      let n = 0;
      return () => `nap-${++n}`;
    })(),
  };
}

async function toWaiting(now = T0) {
  const deps = makeDeps(now);
  const m = new NapSessionManager(deps);
  m.selectDuration(20);
  await m.start();
  return { deps, m };
}

describe("NapSessionManager lifecycle", () => {
  it("starts idle with no session", () => {
    const { m } = { m: new NapSessionManager(makeDeps()) };
    expect(m.state).toBe("idle");
    expect(m.session).toBeNull();
  });

  it("moves to selecting when a duration is chosen", () => {
    const m = new NapSessionManager(makeDeps());
    m.selectDuration(20);
    expect(m.state).toBe("selecting_duration");
  });

  it("rejects invalid durations", () => {
    const m = new NapSessionManager(makeDeps());
    expect(() => m.selectDuration(3)).toThrow();
    expect(m.state).toBe("idle");
  });

  it("start() requires a chosen duration", async () => {
    const m = new NapSessionManager(makeDeps());
    await expect(m.start()).rejects.toThrow();
  });

  it("arms the detector and schedules the fail-safe on start", async () => {
    const { deps, m } = await toWaiting();
    expect(m.state).toBe("waiting_for_sleep");
    expect(deps.sleep.startCalls).toBe(1);
    expect(deps.scheduler.scheduled).toEqual([
      {
        atMs: T0 + 35 * MIN, // 20 min nap + 15 min fail-safe grace
        kind: "fail_safe",
        sessionId: "nap-1",
      },
    ]);
    const s = m.session!;
    expect(s.state).toBe("waiting_for_sleep");
    expect(s.armedAtMs).toBe(T0);
    expect(s.failSafeWakeAtMs).toBe(T0 + 35 * MIN);
    expect(deps.store.lastSaved).toEqual(s);
  });
});

describe("sleep detection → wake", () => {
  it("begins the countdown at detection time, not at arm time", async () => {
    const { deps, m } = await toWaiting();
    deps.clock.advance(5 * MIN);
    deps.sleep.simulateSleep(deps.clock.nowMs());

    expect(m.state).toBe("sleeping");
    const s = m.session!;
    expect(s.sleepDetectedAtMs).toBe(T0 + 5 * MIN);
    expect(s.expectedWakeAtMs).toBe(T0 + 25 * MIN);
    expect(deps.scheduler.scheduled).toContainEqual({
      atMs: T0 + 25 * MIN,
      kind: "nap_wake",
      sessionId: "nap-1",
    });
    expect(deps.store.lastSaved).toEqual(s);
  });

  it("stays asleep until the deadline, then wakes gently", async () => {
    const { deps, m } = await toWaiting();
    deps.sleep.simulateSleep(T0 + 5 * MIN);

    deps.clock.set(T0 + 24 * MIN);
    m.tick();
    expect(m.state).toBe("sleeping");
    expect(m.remainingMs()).toBe(1 * MIN);

    deps.clock.set(T0 + 25 * MIN);
    m.tick();
    expect(m.state).toBe("waking");
    expect(deps.haptics.played).toEqual([WAKE_PATTERNS.gentle]);
  });

  it("acknowledging the wake completes the nap", async () => {
    const { deps, m } = await toWaiting();
    deps.sleep.simulateSleep(T0 + MIN);
    deps.clock.set(T0 + 21 * MIN);
    m.tick();
    m.acknowledgeWake();

    expect(m.state).toBe("completed");
    expect(deps.haptics.stopCount).toBe(1);
  });

  it("dismiss() resets to idle and clears persisted state", async () => {
    const { deps, m } = await toWaiting();
    deps.sleep.simulateSleep(T0 + MIN);
    deps.clock.set(T0 + 21 * MIN);
    m.tick();
    m.acknowledgeWake();
    await m.dismiss();

    expect(m.state).toBe("idle");
    expect(m.session).toBeNull();
    expect(deps.store.lastSaved).toBeNull();
    expect(deps.scheduler.cancelAllCalls).toBeGreaterThan(0);
    expect(deps.sleep.stopCalls).toBe(1);
  });
});

describe("cancellation", () => {
  it("cancels a waiting nap cleanly", async () => {
    const { deps, m } = await toWaiting();
    await m.cancel();
    expect(m.state).toBe("cancelled");
    expect(deps.sleep.stopCalls).toBe(1);
    expect(deps.scheduler.cancelAllCalls).toBe(1);
  });

  it("cancels mid-nap (user woke early)", async () => {
    const { deps, m } = await toWaiting();
    deps.sleep.simulateSleep(T0 + 2 * MIN);
    deps.clock.set(T0 + 10 * MIN);
    await m.cancel();
    expect(m.state).toBe("cancelled");
  });
});

describe("fail-safe", () => {
  it("wakes the user at armedAt + duration + grace if sleep never detected", async () => {
    const { deps, m } = await toWaiting();
    deps.clock.set(T0 + 34 * MIN);
    m.tick();
    expect(m.state).toBe("waiting_for_sleep");

    deps.clock.set(T0 + 35 * MIN);
    m.tick();
    expect(m.state).toBe("waking");
    expect(deps.haptics.played).toEqual([WAKE_PATTERNS.gentle]);
  });
});

describe("manual start fallback", () => {
  it("starts the countdown immediately when detection is unavailable", async () => {
    const deps = makeDeps();
    const m = new NapSessionManager(deps);
    m.selectDuration(30);
    await m.startManually();

    expect(m.state).toBe("sleeping");
    expect(m.session!.sleepDetectedAtMs).toBe(T0);
    expect(m.session!.expectedWakeAtMs).toBe(T0 + 30 * MIN);
    expect(deps.sleep.startCalls).toBe(0); // no detector involved
    expect(deps.scheduler.scheduled).toContainEqual({
      atMs: T0 + 30 * MIN,
      kind: "nap_wake",
      sessionId: "nap-1",
    });
  });
});

describe("detector failure", () => {
  it("lands in a calm error state, not a crash", async () => {
    const deps = makeDeps();
    deps.sleep.failStartWith(new Error("HealthKit denied"));
    const m = new NapSessionManager(deps);
    m.selectDuration(20);
    await m.start();

    expect(m.state).toBe("error");
    expect(deps.scheduler.scheduled).toHaveLength(0);
    await m.dismiss();
    expect(m.state).toBe("idle");
  });
});

describe("recovery after process death", () => {
  const persisted = (over: Partial<NapSessionSnapshot>): NapSessionSnapshot => ({
    id: "nap-1",
    selectedDurationMinutes: 20,
    state: "sleeping",
    armedAtMs: T0,
    sleepDetectedAtMs: T0 + 5 * MIN,
    expectedWakeAtMs: T0 + 25 * MIN,
    failSafeWakeAtMs: T0 + 35 * MIN,
    ...over,
  });

  async function resumeWith(
    snapshot: NapSessionSnapshot | null,
    now: number,
  ) {
    const deps = makeDeps(now);
    if (snapshot) deps.store.seed(snapshot);
    const m = await NapSessionManager.resume(deps);
    return { deps, m };
  }

  it("no snapshot → idle", async () => {
    const { m } = await resumeWith(null, T0);
    expect(m.state).toBe("idle");
    expect(m.session).toBeNull();
  });

  it("sleeping and not yet due → resumes sleeping", async () => {
    const { deps, m } = await resumeWith(persisted({}), T0 + 20 * MIN);
    expect(m.state).toBe("sleeping");
    expect(m.remainingMs()).toBe(5 * MIN);
    expect(deps.sleep.startCalls).toBe(0); // already detected; nothing to restart
  });

  it("sleeping and overdue → wakes immediately", async () => {
    const { deps, m } = await resumeWith(persisted({}), T0 + 26 * MIN);
    expect(m.state).toBe("waking");
    expect(deps.haptics.played).toEqual([WAKE_PATTERNS.gentle]);
  });

  it("waiting and not yet due → resumes waiting and re-arms the detector", async () => {
    const { deps, m } = await resumeWith(
      persisted({ state: "waiting_for_sleep", sleepDetectedAtMs: null, expectedWakeAtMs: null }),
      T0 + 2 * MIN,
    );
    expect(m.state).toBe("waiting_for_sleep");
    expect(deps.sleep.startCalls).toBe(1);
  });

  it("waiting past the fail-safe → wakes immediately", async () => {
    const { m } = await resumeWith(
      persisted({ state: "waiting_for_sleep", sleepDetectedAtMs: null, expectedWakeAtMs: null }),
      T0 + 40 * MIN,
    );
    expect(m.state).toBe("waking");
  });

  it("killed while armed → resumes as waiting", async () => {
    const { m } = await resumeWith(
      persisted({ state: "armed", sleepDetectedAtMs: null, expectedWakeAtMs: null }),
      T0 + MIN,
    );
    expect(m.state).toBe("waiting_for_sleep");
  });

  it("completed or cancelled snapshots are cleared → idle", async () => {
    for (const state of ["completed", "cancelled", "error"] as const) {
      const { deps, m } = await resumeWith(persisted({ state }), T0);
      expect(m.state).toBe("idle");
      expect(deps.store.lastSaved).toBeNull();
    }
  });
});

describe("observability", () => {
  it("notifies subscribers on every transition", async () => {
    const { deps, m } = await toWaiting();
    const seen: string[] = [];
    const unsub = m.subscribe((s) => seen.push(s?.state ?? "none"));

    deps.sleep.simulateSleep(T0 + MIN);
    deps.clock.set(T0 + 21 * MIN);
    m.tick();
    m.acknowledgeWake();
    await m.dismiss();
    unsub();

    expect(seen).toEqual(["sleeping", "waking", "completed", "idle"]);
  });
});
