import type { NapState } from "@siesta/core";

/** Language-neutral ops a port must be able to replay. */
export type ScenarioOp =
  | { op: "select"; minutes: number }
  | { op: "start" }
  | { op: "startManually" }
  | { op: "advance"; toMs: number }
  | { op: "sleepDetected"; atMs: number }
  | { op: "tick" }
  | { op: "acknowledge" }
  | { op: "cancel" }
  | { op: "dismiss" }
  | { op: "resume"; atMs: number };

export interface Vectors {
  transitions: {
    version: 1;
    cases: Array<{ from: NapState; event: unknown; to: NapState }>;
  };
  wake: {
    version: 1;
    cases: Array<{
      sleepDetectedAtMs: number;
      durationMinutes: number;
      expectedWakeAtMs: number;
    }>;
  };
  failSafe: {
    version: 1;
    cases: Array<{
      armedAtMs: number;
      durationMinutes: number;
      graceMinutes: number;
      failSafeWakeAtMs: number;
    }>;
  };
  onset: {
    version: 1;
    cases: Array<{
      name: string;
      config: unknown;
      samples: unknown[];
      expectedOnsetAtMs: number | null;
    }>;
  };
  scenarios: {
    version: 1;
    opsSpec: Record<string, string>;
    cases: Array<{ name: string; startMs: number; ops: ScenarioOp[]; expected: unknown }>;
  };
  constants: { version: 1; values: unknown };
}

/** Wrap raw vector data with versions + an ops spec ports can rely on. */
export function buildVectors(raw: {
  transitions: Vectors["transitions"]["cases"];
  wake: Vectors["wake"]["cases"];
  failSafe: Vectors["failSafe"]["cases"];
  onset: Vectors["onset"]["cases"];
  scenarios: Vectors["scenarios"]["cases"];
  constants: unknown;
}): Vectors {
  return {
    transitions: { version: 1, cases: raw.transitions },
    wake: { version: 1, cases: raw.wake },
    failSafe: { version: 1, cases: raw.failSafe },
    onset: { version: 1, cases: raw.onset },
    scenarios: {
      version: 1,
      opsSpec: {
        select: "choose duration (minutes)",
        start: "arm detection + fail-safe (clock at scenario T0)",
        startManually: "manual countdown start (no detector)",
        advance: "move the test clock to toMs",
        sleepDetected: "fire the sleep callback at atMs",
        tick: "evaluate deadlines",
        acknowledge: "user acknowledged the wake",
        cancel: "user cancelled",
        dismiss: "reset to idle",
        resume: "kill and resume the manager at atMs",
      },
      cases: raw.scenarios,
    },
    constants: { version: 1, values: raw.constants },
  };
}
