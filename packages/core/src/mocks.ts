import type { WakePattern } from "./haptics";
import type {
  AlarmKind,
  AlarmScheduler,
  HapticService,
  SessionStore,
  SleepDetectionService,
} from "./services";
import type { EpochMs, NapSessionSnapshot, Unsubscribe } from "./types";

export { ManualClock } from "./clock";

/** Dev/test detector. `simulateSleep` is the "Simulate sleep" dev control. */
export class MockSleepDetectionService implements SleepDetectionService {
  startCalls = 0;
  stopDetectionCalls = 0;
  stopCalls = 0;
  running = false;
  private failStartError: Error | null = null;
  private listeners = new Set<(atMs: EpochMs) => void>();

  async start(): Promise<void> {
    this.startCalls += 1;
    if (this.failStartError) throw this.failStartError;
    this.running = true;
  }

  async stopDetection(): Promise<void> {
    this.stopDetectionCalls += 1;
  }

  async stop(): Promise<void> {
    if (this.running) {
      this.stopCalls += 1;
      this.running = false;
    }
  }

  onSleepDetected(callback: (atMs: EpochMs) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  simulateSleep(atMs: EpochMs): void {
    for (const cb of [...this.listeners]) cb(atMs);
  }

  failStartWith(error: Error): void {
    this.failStartError = error;
  }
}

export interface ScheduledAlarm {
  atMs: EpochMs;
  kind: AlarmKind;
  sessionId: string;
}

export class RecordingAlarmScheduler implements AlarmScheduler {
  scheduled: ScheduledAlarm[] = [];
  cancelAllCalls = 0;

  async schedule(atMs: EpochMs, kind: AlarmKind, sessionId: string): Promise<void> {
    this.scheduled.push({ atMs, kind, sessionId });
  }

  async cancelAll(): Promise<void> {
    this.cancelAllCalls += 1;
  }
}

export class RecordingHaptics implements HapticService {
  played: WakePattern[] = [];
  stopCount = 0;

  async playWake(pattern: WakePattern): Promise<void> {
    this.played.push(pattern);
  }

  async stop(): Promise<void> {
    this.stopCount += 1;
  }
}

export class InMemorySessionStore implements SessionStore {
  lastSaved: NapSessionSnapshot | null = null;

  async load(): Promise<NapSessionSnapshot | null> {
    return this.lastSaved;
  }

  async save(session: NapSessionSnapshot): Promise<void> {
    this.lastSaved = { ...session };
  }

  async clear(): Promise<void> {
    this.lastSaved = null;
  }

  seed(session: NapSessionSnapshot): void {
    this.lastSaved = { ...session };
  }
}
