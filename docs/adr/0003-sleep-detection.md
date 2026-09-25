# ADR 0003 — Sleep detection is a heuristic with honest fallbacks

## Status

Accepted — 2026-09-25

## Context

The product promise is "the countdown starts when you fall asleep." No platform
offers a real-time sleep-onset API; HealthKit and Health Connect sleep records
arrive after the fact.

## Decision

`SleepDetectionService` is an interface; per-platform implementations run an
onset heuristic:

- **watchOS:** `HKWorkoutSession` (`.mindAndBody`) → continuous HR via
  `HKLiveWorkoutBuilder` + `CMDeviceMotion`. Onset = sustained HR drop below
  session baseline AND motion below threshold for a confirmation window.
- **Wear OS:** Health Services HR + `SensorManager` accelerometer inside a
  foreground service. Same heuristic contract.
- **Everywhere:** `MockSleepDetectionService` for development and tests.

The domain never detects anything itself — it consumes `onSleepDetected`
events and computes `wakeAt = sleepDetectedAt + duration`.

## Honesty rules (binding)

1. Copy says "estimates"/"noticed you fell asleep", never medical claims.
2. Permission denied → offer manual-start mode explicitly.
3. Sensor failure mid-session → degrade to elapsed countdown + say so.
4. A configurable fail-safe cap (e.g. duration + 15 min) guarantees wake even
   if detection never fires — user asked for a nap, we never leave them
   un-woken without consent. Communicated as a quiet "latest wake time"
   visible on the waiting screen.

## Consequences

- Accuracy is bounded by wrist HR quality; loose wrists and high ambient
  motion degrade it. Documented limitation, validated on hardware in Phase 5/6.
- The workout-session approach adds an Activity-ring entry on Apple Watch —
  disclosed in onboarding (real-world precedent exists).
