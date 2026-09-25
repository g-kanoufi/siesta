import type { EpochMs } from "./types";

/** Time source. Injected everywhere so domain logic is deterministic in tests. */
export interface Clock {
  nowMs(): EpochMs;
}

export class SystemClock implements Clock {
  nowMs(): EpochMs {
    return Date.now();
  }
}

export class ManualClock implements Clock {
  private current: EpochMs;

  constructor(startMs: EpochMs) {
    this.current = startMs;
  }

  nowMs(): EpochMs {
    return this.current;
  }

  set(ms: EpochMs): void {
    this.current = ms;
  }

  advance(deltaMs: number): void {
    this.current += deltaMs;
  }
}
