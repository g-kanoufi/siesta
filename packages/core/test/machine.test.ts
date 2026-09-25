import { NAP_STATES, initialState, transition } from "../src/machine";
import type { NapEvent, NapState } from "../src/machine";

describe("nap state machine", () => {
  it("starts idle", () => {
    expect(initialState()).toBe("idle");
  });

  it("exposes exactly the documented states", () => {
    expect([...NAP_STATES].sort()).toEqual(
      [
        "armed",
        "cancelled",
        "completed",
        "error",
        "idle",
        "selecting_duration",
        "sleeping",
        "waiting_for_sleep",
        "waking",
      ].sort(),
    );
  });

  const cases: Array<[NapState, NapEvent, NapState]> = [
    // The happy path: idle → selecting → armed → waiting → sleeping → waking → completed
    ["idle", { type: "duration_selected", minutes: 20 }, "selecting_duration"],
    ["selecting_duration", { type: "duration_selected", minutes: 30 }, "selecting_duration"],
    ["selecting_duration", { type: "start" }, "armed"],
    ["armed", { type: "detector_ready" }, "waiting_for_sleep"],
    ["waiting_for_sleep", { type: "sleep_detected", atMs: 1_000 }, "sleeping"],
    ["sleeping", { type: "wake_due" }, "waking"],
    ["waking", { type: "wake_acknowledged" }, "completed"],
    ["completed", { type: "reset" }, "idle"],

    // Fail-safe: user never detected asleep but the cap was reached
    ["waiting_for_sleep", { type: "wake_due" }, "waking"],
    ["waking", { type: "cancel" }, "completed"],

    // Cancellation from every armable state
    ["selecting_duration", { type: "cancel" }, "idle"],
    ["armed", { type: "cancel" }, "cancelled"],
    ["waiting_for_sleep", { type: "cancel" }, "cancelled"],
    ["sleeping", { type: "cancel" }, "cancelled"],
    ["cancelled", { type: "reset" }, "idle"],

    // Errors
    ["armed", { type: "error", reason: "sensor" }, "error"],
    ["waiting_for_sleep", { type: "error", reason: "sensor" }, "error"],
    ["sleeping", { type: "error", reason: "sensor" }, "error"],
    ["error", { type: "reset" }, "idle"],

    // No-ops: late or impossible events must not corrupt state
    ["idle", { type: "sleep_detected", atMs: 1_000 }, "idle"],
    ["idle", { type: "wake_due" }, "idle"],
    ["idle", { type: "detector_ready" }, "idle"],
    ["selecting_duration", { type: "sleep_detected", atMs: 5 }, "selecting_duration"],
    ["sleeping", { type: "sleep_detected", atMs: 5 }, "sleeping"],
    ["sleeping", { type: "detector_ready" }, "sleeping"],
    ["cancelled", { type: "sleep_detected", atMs: 5 }, "cancelled"],
    ["cancelled", { type: "wake_due" }, "cancelled"],
    ["completed", { type: "sleep_detected", atMs: 5 }, "completed"],
    ["completed", { type: "wake_due" }, "completed"],
    ["waking", { type: "sleep_detected", atMs: 5 }, "waking"],
    ["idle", { type: "start" }, "idle"],
    ["idle", { type: "wake_acknowledged" }, "idle"],
    ["selecting_duration", { type: "detector_ready" }, "selecting_duration"],
    // A detector that fires before reporting ready still counts —
    // also what manual start dispatches.
    ["armed", { type: "sleep_detected", atMs: 5 }, "sleeping"],
    ["armed", { type: "wake_due" }, "armed"],
    ["idle", { type: "cancel" }, "idle"],
    ["completed", { type: "start" }, "completed"],
  ];

  it.each(cases)("%s + %j → %s", (from, event, expected) => {
    expect(transition(from, event)).toBe(expected);
  });

  it("never throws and never invents states", () => {
    for (const state of NAP_STATES) {
      for (const event of [
        { type: "duration_selected", minutes: 10 },
        { type: "start" },
        { type: "detector_ready" },
        { type: "sleep_detected", atMs: 0 },
        { type: "wake_due" },
        { type: "wake_acknowledged" },
        { type: "cancel" },
        { type: "error", reason: "x" },
        { type: "reset" },
      ] as NapEvent[]) {
        expect(NAP_STATES).toContain(transition(state, event));
      }
    }
  });
});
