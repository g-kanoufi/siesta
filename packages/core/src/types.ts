import type { NapState } from "./machine";

/** Epoch milliseconds. All domain math is absolute-time; never counters. */
export type EpochMs = number;

export type Unsubscribe = () => void;

/**
 * The persisted nap session. Serializable as-is — the same shape is written
 * by the Swift and Kotlin ports and appears in shared test vectors.
 */
export interface NapSessionSnapshot {
  id: string;
  selectedDurationMinutes: number;
  state: NapState;
  armedAtMs: EpochMs | null;
  sleepDetectedAtMs: EpochMs | null;
  expectedWakeAtMs: EpochMs | null;
  /** armedAt + duration + grace — the latest the user can possibly sleep. */
  failSafeWakeAtMs: EpochMs | null;
}
