import type { WakePattern } from "./haptics";
import type { EpochMs, NapSessionSnapshot, Unsubscribe } from "./types";

/**
 * Platform boundary. The domain knows nothing about HealthKit, Health
 * Connect, UNNotificationCenter, or AlarmManager — only these contracts.
 * Implementations: Apple*, Wear*, Mock*. (Dependency inversion, §30–32.)
 */
export interface SleepDetectionService {
  /** Begin sampling. Rejects with a calm reason if unavailable/denied. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Fires once the platform estimates the user fell asleep. */
  onSleepDetected(callback: (atMs: EpochMs) => void): Unsubscribe;
}

export type AlarmKind = "nap_wake" | "fail_safe";

/**
 * Schedules the wake that fires even if the app is suspended —
 * UNNotificationRequest on watchOS, exact alarm + notification on Wear OS.
 */
export interface AlarmScheduler {
  schedule(atMs: EpochMs, kind: AlarmKind, sessionId: string): Promise<void>;
  cancelAll(): Promise<void>;
}

/** Foreground haptics — the escalating gentle wake while app is alive. */
export interface HapticService {
  playWake(pattern: WakePattern): Promise<void>;
  stop(): Promise<void>;
}

export interface SessionStore {
  load(): Promise<NapSessionSnapshot | null>;
  save(session: NapSessionSnapshot): Promise<void>;
  clear(): Promise<void>;
}
