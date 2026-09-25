export { SystemClock, ManualClock } from "./clock";
export type { Clock } from "./clock";
export {
  DEFAULT_DURATION_MINUTES,
  MAX_NAP_MINUTES,
  MIN_NAP_MINUTES,
  NAP_DURATION_PRESETS,
  isValidDuration,
  presetFor,
} from "./durations";
export type { NapDurationPreset } from "./durations";
export { NAP_STATES, initialState, transition } from "./machine";
export type { NapEvent, NapState } from "./machine";
export {
  DEFAULT_FAIL_SAFE_GRACE_MINUTES,
  MINUTE_MS,
  computeFailSafeWakeAtMs,
  computeWakeAtMs,
  nextDeadlineMs,
  remainingMs,
} from "./wake";
export {
  DEFAULT_ONSET_CONFIG,
  SleepOnsetDetector,
} from "./sleepOnset";
export type { PhysioSample, SleepOnsetConfig } from "./sleepOnset";
export { WAKE_PATTERNS, patternDurationMs } from "./haptics";
export type { WakeIntensity, WakePattern, WakeStep } from "./haptics";
export { NapSessionManager } from "./session";
export type { NapSessionDeps, NapViewState } from "./session";
export type {
  AlarmKind,
  AlarmScheduler,
  HapticService,
  SessionStore,
  SleepDetectionService,
} from "./services";
export {
  InMemorySessionStore,
  MockSleepDetectionService,
  RecordingAlarmScheduler,
  RecordingHaptics,
} from "./mocks";
export type { ScheduledAlarm } from "./mocks";
export type { EpochMs, NapSessionSnapshot, Unsubscribe } from "./types";
