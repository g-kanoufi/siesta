import { isValidDuration } from "./durations";
import { WAKE_PATTERNS, type WakeIntensity } from "./haptics";
import { transition, type NapEvent, type NapState } from "./machine";
import type {
  AlarmScheduler,
  HapticService,
  SessionStore,
  SleepDetectionService,
} from "./services";
import type { Clock } from "./clock";
import {
  computeFailSafeWakeAtMs,
  computeWakeAtMs,
  nextDeadlineMs,
  remainingMs,
} from "./wake";
import type { EpochMs, NapSessionSnapshot, Unsubscribe } from "./types";

export interface NapSessionDeps {
  clock: Clock;
  sleep: SleepDetectionService;
  scheduler: AlarmScheduler;
  haptics: HapticService;
  store: SessionStore;
  newId?: () => string;
  failSafeGraceMinutes?: number;
  wakeIntensity?: WakeIntensity;
}

/** What a screen needs to render — derived, never stored. */
export interface NapViewState {
  state: NapState;
  selectedDurationMinutes: number | null;
  remainingMs: number | null;
  nextDeadlineMs: EpochMs | null;
}

/**
 * Orchestrates one nap: duration → armed → waiting → sleeping → waking.
 * Owns the state machine, persists after every transition, and delegates all
 * platform effects to injected services. The only clock reads are `clock.nowMs()`.
 */
export class NapSessionManager {
  private current: NapState = "idle";
  private snap: NapSessionSnapshot | null = null;
  private pendingMinutes: number | null = null;
  private lastError: string | null = null;
  private listeners = new Set<(snap: NapSessionSnapshot | null) => void>();
  private unsubscribeDetection: Unsubscribe | null = null;

  constructor(private readonly deps: NapSessionDeps) {}

  get state(): NapState {
    return this.current;
  }

  get session(): NapSessionSnapshot | null {
    return this.snap;
  }

  get error(): string | null {
    return this.lastError;
  }

  selectDuration(minutes: number): void {
    if (!isValidDuration(minutes)) {
      throw new RangeError(`Invalid nap duration: ${minutes}`);
    }
    if (this.current !== "idle" && this.current !== "selecting_duration") {
      return;
    }
    this.pendingMinutes = minutes;
    this.dispatch({ type: "duration_selected", minutes });
  }

  /** Arm detection and wait for sleep. Requires a selected duration. */
  async start(): Promise<void> {
    if (this.current !== "selecting_duration" || this.pendingMinutes === null) {
      throw new Error("start() requires a selected duration");
    }
    const now = this.deps.clock.nowMs();
    this.snap = {
      id: this.newId(),
      selectedDurationMinutes: this.pendingMinutes,
      state: this.current,
      armedAtMs: now,
      sleepDetectedAtMs: null,
      expectedWakeAtMs: null,
      failSafeWakeAtMs: computeFailSafeWakeAtMs(
        now,
        this.pendingMinutes,
        this.deps.failSafeGraceMinutes,
      ),
    };
    this.dispatch({ type: "start" });
    this.wireDetection();
    try {
      await this.deps.sleep.start();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "unknown";
      this.dispatch({ type: "error", reason: this.lastError });
      await this.persist();
      return;
    }
    this.dispatch({ type: "detector_ready" });
    await this.deps.scheduler.schedule(
      this.snap.failSafeWakeAtMs!,
      "fail_safe",
      this.snap.id,
    );
    await this.persist();
  }

  /**
   * Manual fallback: no detector, countdown starts now. Honest UX —
   * the app never claims it detected anything.
   */
  async startManually(): Promise<void> {
    if (this.current !== "selecting_duration" || this.pendingMinutes === null) {
      throw new Error("startManually() requires a selected duration");
    }
    const now = this.deps.clock.nowMs();
    this.snap = {
      id: this.newId(),
      selectedDurationMinutes: this.pendingMinutes,
      state: this.current,
      armedAtMs: now,
      sleepDetectedAtMs: null,
      expectedWakeAtMs: null,
      failSafeWakeAtMs: computeFailSafeWakeAtMs(now, this.pendingMinutes, 0),
    };
    this.dispatch({ type: "start" });
    await this.onSleepDetected(now);
  }

  async cancel(): Promise<void> {
    this.dispatch({ type: "cancel" });
    if (this.current === "cancelled" || this.current === "completed") {
      await this.teardown();
    }
    await this.persist();
  }

  acknowledgeWake(): void {
    this.dispatch({ type: "wake_acknowledged" });
    if (this.current === "completed") {
      void this.deps.haptics.stop();
      void this.persist();
    }
  }

  /** Reset a finished/cancelled/errored session back to idle. */
  async dismiss(): Promise<void> {
    this.dispatch({ type: "reset" });
    if (this.current === "idle") {
      await this.teardown();
      this.snap = null;
      this.pendingMinutes = null;
      this.lastError = null;
      await this.persist();
    }
  }

  /** Advance time. Call on tick, on foreground, on scheduler wake. */
  tick(): void {
    const deadline = this.snap === null ? null : nextDeadlineMs(this.snap);
    if (deadline !== null && this.deps.clock.nowMs() >= deadline) {
      this.fireWakeDue();
    }
  }

  remainingMs(): number | null {
    if (this.snap === null) return null;
    return remainingMs(this.snap, this.deps.clock.nowMs());
  }

  view(): NapViewState {
    return {
      state: this.current,
      selectedDurationMinutes:
        this.snap?.selectedDurationMinutes ?? this.pendingMinutes,
      remainingMs: this.remainingMs(),
      nextDeadlineMs: this.snap ? nextDeadlineMs(this.snap) : null,
    };
  }

  subscribe(
    listener: (snap: NapSessionSnapshot | null) => void,
  ): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Rebuild the manager after process death. Reconciles the persisted
   * snapshot against the clock — a nap never silently disappears.
   */
  static async resume(deps: NapSessionDeps): Promise<NapSessionManager> {
    const m = new NapSessionManager(deps);
    const s = await deps.store.load();
    if (s === null) return m;

    m.snap = s;
    m.current = s.state;
    const now = deps.clock.nowMs();

    switch (s.state) {
      case "sleeping":
        if (s.expectedWakeAtMs !== null && now >= s.expectedWakeAtMs) {
          m.fireWakeDue();
        }
        break;
      case "armed":
      case "waiting_for_sleep":
        if (s.state === "armed") {
          m.dispatch({ type: "detector_ready" });
        }
        if (s.failSafeWakeAtMs !== null && now >= s.failSafeWakeAtMs) {
          m.fireWakeDue();
        } else {
          await m.rearmDetection();
        }
        break;
      case "waking":
        await deps.haptics.playWake(
          WAKE_PATTERNS[deps.wakeIntensity ?? "gentle"],
        );
        break;
      default:
        // completed / cancelled / error / idle / selecting: nothing resumable
        await deps.store.clear();
        m.snap = null;
        m.current = "idle";
    }
    return m;
  }

  private async onSleepDetected(atMs: EpochMs): Promise<void> {
    this.dispatch({ type: "sleep_detected", atMs });
    if (this.current !== "sleeping" || this.snap === null) return;
    this.snap.sleepDetectedAtMs = atMs;
    this.snap.expectedWakeAtMs = computeWakeAtMs(
      atMs,
      this.snap.selectedDurationMinutes,
    );
    // Detection done — stop sensors and replace the fail-safe with the
    // definitive wake alarm. Fire-and-forget: platform services queue
    // internally; keeping this synchronous keeps detection latency zero.
    if (this.deps.sleep.stopDetection) {
      void this.deps.sleep.stopDetection();
    } else {
      void this.deps.sleep.stop();
    }
    void this.deps.scheduler.cancelAll();
    void this.deps.scheduler.schedule(
      this.snap.expectedWakeAtMs,
      "nap_wake",
      this.snap.id,
    );
    void this.persist();
  }

  private wireDetection(): void {
    this.unsubscribeDetection = this.deps.sleep.onSleepDetected((atMs) => {
      void this.onSleepDetected(atMs);
    });
  }

  private async rearmDetection(): Promise<void> {
    this.wireDetection();
    try {
      await this.deps.sleep.start();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "unknown";
      this.dispatch({ type: "error", reason: this.lastError });
    }
  }

  private fireWakeDue(): void {
    this.dispatch({ type: "wake_due" });
    if (this.current === "waking") {
      void this.deps.haptics.playWake(
        WAKE_PATTERNS[this.deps.wakeIntensity ?? "gentle"],
      );
      void this.persist();
    }
  }

  private dispatch(event: NapEvent): void {
    const next = transition(this.current, event);
    if (next === this.current) return;
    this.current = next;
    if (this.snap !== null) this.snap.state = next;
    this.emit();
  }

  private async teardown(): Promise<void> {
    this.unsubscribeDetection?.();
    this.unsubscribeDetection = null;
    await this.deps.sleep.stop();
    await this.deps.scheduler.cancelAll();
    await this.deps.haptics.stop();
  }

  private async persist(): Promise<void> {
    if (this.snap === null || this.current === "idle") {
      await this.deps.store.clear();
      return;
    }
    await this.deps.store.save(this.snap);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.snap);
  }

  private newId(): string {
    return this.deps.newId?.() ?? `nap-${this.deps.clock.nowMs()}`;
  }
}
