# Architecture

> North star: **Choose. Sleep. Wake.** Everything else is secondary.

## Shape

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation (platform native, per-platform)                 │
│   watchOS: SwiftUI views   Wear OS: Compose   RN: companion  │
├─────────────────────────────────────────────────────────────┤
│ Domain (three identical implementations, one spec)           │
│   packages/core          TypeScript — canonical, reference   │
│   packages/domain-apple  Swift port — SwiftPM                │
│   packages/domain-wear   Kotlin port — Gradle/JVM            │
│   packages/test-vectors  JSON vectors all three must pass    │
├─────────────────────────────────────────────────────────────┤
│ Infrastructure (platform boundary, per §30)                  │
│   SleepDetectionService / AlarmScheduler / HapticService /   │
│   SessionStore / Clock — interfaces in the domain,           │
│   implementations in the apps                                │
└─────────────────────────────────────────────────────────────┘
```

## Why three implementations?

React Native does not run on watchOS or Wear OS (ADR 0001). The domain is
deliberately tiny — a state machine, presets, epoch-ms wake math, an onset
heuristic — so it is *ported*, not shared, and `packages/test-vectors` keeps
the three copies provably identical:

- TS is canonical. Change it first.
- `npm run test:vectors` regenerates JSON vectors.
- `swift test` and `gradle test` replay them on the native ports.
- The `test-vectors` drift-guard test fails CI if domain changes without
  regenerating vectors.

## The one core flow

```
IDLE → SELECTING_DURATION → ARMED → WAITING_FOR_SLEEP → SLEEPING → WAKING → COMPLETED
                                              │                ▲
                                              └── CANCELLED ◄──┘ (from any armable state)
```

1. User picks a duration (`NapDurationPreset`, recommended: 20 min).
2. `start()` arms the session: detector starts, fail-safe alarm scheduled at
   `armedAt + duration + grace`.
3. Sleep detection fires (`SleepDetectionService.onSleepDetected`) →
   `expectedWakeAt = detectedAt + duration` → definitive `nap_wake` alarm
   replaces the fail-safe.
4. `wake_due` (from `tick()` in-app, or the scheduled alarm natively) →
   escalating haptics.
5. Acknowledge → completed → dismiss → idle.

### Time correctness

Everything is epoch-millisecond arithmetic. There is no countdown counter —
`remainingMs = expectedWakeAtMs − nowMs`. Midnight, DST, suspension, dropped
frames: all free.

### Sleep detection honesty

`SleepOnsetDetector` is a heuristic (baseline HR → sustained drop + stillness
for a confirmation window; onset credited at window start). It estimates —
copy says so, and manual-start / fail-safe paths degrade honestly
(ADR 0003). If the detector can't run, `startManually()` gives a plain
countdown with no detection claims.

## Persistence & recovery

`NapSessionSnapshot` is persisted after every transition (§38 schema: id,
duration, state, armedAt, sleepDetectedAt, expectedWakeAt, failSafeWakeAt).
`NapSessionManager.resume()` reconciles against the clock:

- sleeping + overdue → waking (haptics replay)
- waiting + past fail-safe → waking
- armed/waiting + not due → re-arm detector
- waking → replay haptics
- terminal states → cleared → idle

Platform alarms (`UNNotificationRequest`, `AlarmManager`) are the durable
wake mechanism — they fire even if the app is dead.

## Layering rules (SOLID, kept simple)

- Domain depends on interfaces (`services.ts`), never platform APIs.
- Platform services implement the interfaces; nothing else talks to
  HealthKit/Health Connect/alarms/haptics.
- Mocks (`siesta.testing` / `SiestaDomainMocks` / `src/mocks.ts`) are real
  implementations of the same contracts — dev mode runs the full app on them.
- New platform capability? New implementation of an existing interface.
  If the domain must change, change `@siesta/core` first, regenerate vectors,
  then port.

## Error model

Platform errors → `error` state + `lastError` (calm string, no codes). UI
offers recovery (retry / manual start / settings link). Nothing throws past
the service boundary.
