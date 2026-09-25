import type { EpochMs, NapSessionSnapshot } from "./types";

export const MINUTE_MS = 60_000;
export const DEFAULT_FAIL_SAFE_GRACE_MINUTES = 15;

/**
 * The nap wake time. Epoch-ms arithmetic means "20 minutes" is 20 elapsed
 * minutes regardless of midnight, DST transitions, or timezone changes.
 */
export function computeWakeAtMs(
  sleepDetectedAtMs: EpochMs,
  durationMinutes: number,
): EpochMs {
  return sleepDetectedAtMs + durationMinutes * MINUTE_MS;
}

/**
 * The latest the user may sleep if detection never fires: the full nap
 * duration plus a grace period for falling asleep, measured from arm time.
 */
export function computeFailSafeWakeAtMs(
  armedAtMs: EpochMs,
  durationMinutes: number,
  graceMinutes: number = DEFAULT_FAIL_SAFE_GRACE_MINUTES,
): EpochMs {
  return armedAtMs + (durationMinutes + graceMinutes) * MINUTE_MS;
}

/** The next deadline that can move the session into `waking`. */
export function nextDeadlineMs(session: NapSessionSnapshot): EpochMs | null {
  switch (session.state) {
    case "waiting_for_sleep":
      return session.failSafeWakeAtMs;
    case "sleeping":
      return session.expectedWakeAtMs;
    default:
      return null;
  }
}

/** Countdown for the sleeping state. Clamped at 0; null when no deadline. */
export function remainingMs(
  session: NapSessionSnapshot,
  nowMs: EpochMs,
): number | null {
  const deadline = nextDeadlineMs(session);
  if (deadline === null) return null;
  return Math.max(0, deadline - nowMs);
}
