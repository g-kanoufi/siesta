import type { EpochMs } from "./types";

export const NAP_STATES = [
  "idle",
  "selecting_duration",
  "armed",
  "waiting_for_sleep",
  "sleeping",
  "waking",
  "completed",
  "cancelled",
  "error",
] as const;

export type NapState = (typeof NAP_STATES)[number];

export type NapEvent =
  | { type: "duration_selected"; minutes: number }
  | { type: "start" }
  | { type: "detector_ready" }
  | { type: "sleep_detected"; atMs: EpochMs }
  | { type: "wake_due" }
  | { type: "wake_acknowledged" }
  | { type: "cancel" }
  | { type: "error"; reason: string }
  | { type: "reset" };

export function initialState(): NapState {
  return "idle";
}

/**
 * Pure, total transition function. Unknown (state, event) pairs are no-ops —
 * async platform events can arrive late and must never corrupt the session.
 */
export function transition(state: NapState, event: NapEvent): NapState {
  switch (state) {
    case "idle":
      return event.type === "duration_selected" ? "selecting_duration" : state;
    case "selecting_duration":
      switch (event.type) {
        case "duration_selected":
          return "selecting_duration";
        case "start":
          return "armed";
        case "cancel":
          return "idle";
        default:
          return state;
      }
    case "armed":
      switch (event.type) {
        case "detector_ready":
          return "waiting_for_sleep";
        case "sleep_detected":
          // Manual start, or a detector that fired before reporting ready.
          return "sleeping";
        case "cancel":
          return "cancelled";
        case "error":
          return "error";
        default:
          return state;
      }
    case "waiting_for_sleep":
      switch (event.type) {
        case "sleep_detected":
          return "sleeping";
        case "wake_due":
          // Fail-safe reached before detection.
          return "waking";
        case "cancel":
          return "cancelled";
        case "error":
          return "error";
        default:
          return state;
      }
    case "sleeping":
      switch (event.type) {
        case "wake_due":
          return "waking";
        case "cancel":
          return "cancelled";
        case "error":
          return "error";
        default:
          return state;
      }
    case "waking":
      // Either an explicit acknowledgement or a cancel means "I'm up".
      return event.type === "wake_acknowledged" || event.type === "cancel"
        ? "completed"
        : state;
    case "completed":
    case "cancelled":
    case "error":
      return event.type === "reset" ? "idle" : state;
  }
}
