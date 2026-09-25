import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_FAIL_SAFE_GRACE_MINUTES,
  DEFAULT_ONSET_CONFIG,
  InMemorySessionStore,
  ManualClock,
  MockSleepDetectionService,
  NAP_DURATION_PRESETS,
  NAP_STATES,
  NapSessionManager,
  RecordingAlarmScheduler,
  RecordingHaptics,
  SleepOnsetDetector,
  WAKE_PATTERNS,
  computeFailSafeWakeAtMs,
  computeWakeAtMs,
  transition,
  type NapEvent,
} from "@siesta/core";
import {
  accessibility,
  ambient,
  colors,
  motion,
  radii,
  spacing,
  typography,
} from "@siesta/design-tokens";
import { buildVectors, type ScenarioOp } from "./vectors";

const MIN = 60_000;
const T0 = Date.parse("2026-09-25T12:00:00.000Z");

const canonicalEvents: NapEvent[] = [
  { type: "duration_selected", minutes: 20 },
  { type: "start" },
  { type: "detector_ready" },
  { type: "sleep_detected", atMs: T0 },
  { type: "wake_due" },
  { type: "wake_acknowledged" },
  { type: "cancel" },
  { type: "error", reason: "sensor_unavailable" },
  { type: "reset" },
];

/** Execute a language-neutral scenario script against the real manager. */
async function runScenario(ops: ScenarioOp[]) {
  const deps = {
    clock: new ManualClock(T0),
    sleep: new MockSleepDetectionService(),
    scheduler: new RecordingAlarmScheduler(),
    haptics: new RecordingHaptics(),
    store: new InMemorySessionStore(),
    newId: () => "nap-1",
  };
  let m: NapSessionManager = new NapSessionManager(deps);
  for (const op of ops) {
    switch (op.op) {
      case "select":
        m.selectDuration(op.minutes);
        break;
      case "start":
        await m.start();
        break;
      case "startManually":
        await m.startManually();
        break;
      case "advance":
        deps.clock.set(op.toMs);
        break;
      case "sleepDetected":
        deps.sleep.simulateSleep(op.atMs);
        break;
      case "tick":
        m.tick();
        break;
      case "acknowledge":
        m.acknowledgeWake();
        break;
      case "cancel":
        await m.cancel();
        break;
      case "dismiss":
        await m.dismiss();
        break;
      case "resume":
        deps.clock.set(op.atMs);
        m = await NapSessionManager.resume(deps);
        break;
    }
  }
  const s = m.session;
  return {
    state: m.state,
    session: s
      ? {
          state: s.state,
          selectedDurationMinutes: s.selectedDurationMinutes,
          armedAtMs: s.armedAtMs,
          sleepDetectedAtMs: s.sleepDetectedAtMs,
          expectedWakeAtMs: s.expectedWakeAtMs,
          failSafeWakeAtMs: s.failSafeWakeAtMs,
        }
      : null,
    remainingMs: m.remainingMs(),
    scheduledAlarms: deps.scheduler.scheduled,
    wakePatternsPlayed: deps.haptics.played,
  };
}

export async function generateAll() {
  const transitions = NAP_STATES.flatMap((from) =>
    canonicalEvents.map((event) => ({
      from,
      event,
      to: transition(from, event),
    })),
  );

  const wake = [
    { sleepDetectedAtMs: T0, durationMinutes: 20, expectedWakeAtMs: computeWakeAtMs(T0, 20) },
    {
      sleepDetectedAtMs: Date.parse("2026-09-25T23:55:00Z"),
      durationMinutes: 20,
      expectedWakeAtMs: Date.parse("2026-09-26T00:15:00Z"),
    },
    { sleepDetectedAtMs: T0, durationMinutes: 90, expectedWakeAtMs: computeWakeAtMs(T0, 90) },
    { sleepDetectedAtMs: T0, durationMinutes: 5, expectedWakeAtMs: computeWakeAtMs(T0, 5) },
    {
      sleepDetectedAtMs: Date.parse("2026-10-25T00:45:00Z"),
      durationMinutes: 20,
      expectedWakeAtMs: Date.parse("2026-10-25T01:05:00Z"),
    },
  ];

  const failSafe = [
    { armedAtMs: T0, durationMinutes: 20, graceMinutes: DEFAULT_FAIL_SAFE_GRACE_MINUTES, failSafeWakeAtMs: computeFailSafeWakeAtMs(T0, 20) },
    { armedAtMs: T0, durationMinutes: 90, graceMinutes: DEFAULT_FAIL_SAFE_GRACE_MINUTES, failSafeWakeAtMs: computeFailSafeWakeAtMs(T0, 90) },
    { armedAtMs: T0, durationMinutes: 20, graceMinutes: 0, failSafeWakeAtMs: computeFailSafeWakeAtMs(T0, 20, 0) },
  ];

  const onsetConfig = DEFAULT_ONSET_CONFIG;
  const feed = (
    blocks: Array<{ fromMs: number; toMs: number; heartRate?: number; motion?: number }>,
  ) => {
    const d = new SleepOnsetDetector();
    const samples: unknown[] = [];
    for (const b of blocks) {
      for (let t = b.fromMs; t <= b.toMs; t += 10_000) {
        const s: Record<string, number> = { atMs: t };
        if (b.heartRate !== undefined) s.heartRate = b.heartRate;
        if (b.motion !== undefined) s.motion = b.motion;
        samples.push(s);
        d.feed(s as never);
      }
    }
    return { samples, expectedOnsetAtMs: d.onsetAtMs };
  };

  const onset = [
    {
      name: "hr-drop-calm",
      config: onsetConfig,
      ...feed([
        { fromMs: T0, toMs: T0 + 2 * MIN, heartRate: 70, motion: 0.2 },
        { fromMs: T0 + 2 * MIN + 10_000, toMs: T0 + 8 * MIN, heartRate: 60, motion: 0.01 },
      ]),
    },
    {
      name: "motion-only",
      config: onsetConfig,
      ...feed([
        { fromMs: T0, toMs: T0 + 2 * MIN, motion: 0.3 },
        { fromMs: T0 + 2 * MIN + 10_000, toMs: T0 + 8 * MIN, motion: 0.01 },
      ]),
    },
    {
      name: "movement-resets-window",
      config: onsetConfig,
      ...feed([
        { fromMs: T0, toMs: T0 + 2 * MIN, heartRate: 70, motion: 0.2 },
        { fromMs: T0 + 2 * MIN + 10_000, toMs: T0 + 4 * MIN - 10_000, heartRate: 60, motion: 0.01 },
        { fromMs: T0 + 4 * MIN, toMs: T0 + 4 * MIN, heartRate: 62, motion: 0.4 },
        { fromMs: T0 + 4 * MIN + 10_000, toMs: T0 + 9 * MIN, heartRate: 60, motion: 0.01 },
      ]),
    },
    {
      name: "never-sleeps",
      config: onsetConfig,
      ...feed([{ fromMs: T0, toMs: T0 + 10 * MIN, heartRate: 70, motion: 0.1 }]),
    },
  ];

  const scenarios = [
    {
      name: "power-nap-happy-path",
      startMs: T0,
      ops: [
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "advance", toMs: T0 + 5 * MIN },
        { op: "sleepDetected", atMs: T0 + 5 * MIN },
        { op: "advance", toMs: T0 + 25 * MIN },
        { op: "tick" },
        { op: "acknowledge" },
        { op: "dismiss" },
      ] satisfies ScenarioOp[],
      expected: await runScenario([
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "advance", toMs: T0 + 5 * MIN },
        { op: "sleepDetected", atMs: T0 + 5 * MIN },
        { op: "advance", toMs: T0 + 25 * MIN },
        { op: "tick" },
        { op: "acknowledge" },
        { op: "dismiss" },
      ]),
    },
    {
      name: "fail-safe-wake-without-detection",
      startMs: T0,
      ops: [
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "advance", toMs: T0 + 35 * MIN },
        { op: "tick" },
      ] satisfies ScenarioOp[],
      expected: await runScenario([
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "advance", toMs: T0 + 35 * MIN },
        { op: "tick" },
      ]),
    },
    {
      name: "midnight-crossing",
      startMs: T0,
      ops: [
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "sleepDetected", atMs: Date.parse("2026-09-25T23:55:00Z") },
        { op: "advance", toMs: Date.parse("2026-09-26T00:15:00Z") },
        { op: "tick" },
      ] satisfies ScenarioOp[],
      expected: await runScenario([
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "sleepDetected", atMs: Date.parse("2026-09-25T23:55:00Z") },
        { op: "advance", toMs: Date.parse("2026-09-26T00:15:00Z") },
        { op: "tick" },
      ]),
    },
    {
      name: "manual-start",
      startMs: T0,
      ops: [
        { op: "select", minutes: 30 },
        { op: "startManually" },
        { op: "advance", toMs: T0 + 30 * MIN },
        { op: "tick" },
      ] satisfies ScenarioOp[],
      expected: await runScenario([
        { op: "select", minutes: 30 },
        { op: "startManually" },
        { op: "advance", toMs: T0 + 30 * MIN },
        { op: "tick" },
      ]),
    },
    {
      name: "cancel-while-waiting",
      startMs: T0,
      ops: [
        { op: "select", minutes: 15 },
        { op: "start" },
        { op: "advance", toMs: T0 + MIN },
        { op: "cancel" },
      ] satisfies ScenarioOp[],
      expected: await runScenario([
        { op: "select", minutes: 15 },
        { op: "start" },
        { op: "advance", toMs: T0 + MIN },
        { op: "cancel" },
      ]),
    },
    {
      name: "resume-overdue-nap",
      startMs: T0,
      ops: [
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "sleepDetected", atMs: T0 + 5 * MIN },
        { op: "resume", atMs: T0 + 40 * MIN },
      ] satisfies ScenarioOp[],
      expected: await runScenario([
        { op: "select", minutes: 20 },
        { op: "start" },
        { op: "sleepDetected", atMs: T0 + 5 * MIN },
        { op: "resume", atMs: T0 + 40 * MIN },
      ]),
    },
  ];

  const constants = {
    napStates: NAP_STATES,
    durationPresets: NAP_DURATION_PRESETS,
    failSafeGraceMinutes: DEFAULT_FAIL_SAFE_GRACE_MINUTES,
    onsetConfig: DEFAULT_ONSET_CONFIG,
    wakePatterns: WAKE_PATTERNS,
    tokens: { colors, typography, spacing, radii, motion, ambient, accessibility },
  };

  return buildVectors({ transitions, wake, failSafe, onset, scenarios, constants });
}

const outDir = join(process.cwd(), "vectors");

export async function main() {
  const vectors = await generateAll();
  mkdirSync(outDir, { recursive: true });
  for (const [name, data] of Object.entries(vectors)) {
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`Wrote ${Object.keys(vectors).length} vector files to ${outDir}`);
}


