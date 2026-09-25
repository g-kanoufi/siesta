import { useEffect, useMemo, useState } from "react";
import {
  MockSleepDetectionService,
  NapSessionManager,
  SystemClock,
  type NapSessionSnapshot,
  type NapViewState,
} from "@siesta/core";
import {
  AsyncStorageSessionStore,
  ExpoAlarmScheduler,
  ExpoHapticService,
} from "./services";

/**
 * The phone companion uses the Mock detector — real detection lives in the
 * native watch apps. In dev builds, `sleep` is exposed for the
 * "Simulate sleep" control (never shipped).
 */
export const sleepDetector = new MockSleepDetectionService();

const deps = {
  clock: new SystemClock(),
  sleep: sleepDetector,
  scheduler: new ExpoAlarmScheduler(),
  haptics: new ExpoHapticService(),
  store: new AsyncStorageSessionStore(),
};

let managerPromise: Promise<NapSessionManager> | null = null;

export function getManager(): Promise<NapSessionManager> {
  managerPromise ??= NapSessionManager.resume(deps);
  return managerPromise;
}

export function useNap(): {
  view: NapViewState | null;
  session: NapSessionSnapshot | null;
  manager: NapSessionManager | null;
} {
  const [manager, setManager] = useState<NapSessionManager | null>(null);
  const [session, setSession] = useState<NapSessionSnapshot | null>(null);
  const [view, setView] = useState<NapViewState | null>(null);

  useEffect(() => {
    let mounted = true;
    void getManager().then((m) => {
      if (mounted) {
        setManager(m);
        setSession(m.session);
        setView(m.view());
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!manager) return;
    const unsub = manager.subscribe((snap) => {
      setSession(snap);
      setView(manager.view());
    });
    return unsub;
  }, [manager]);

  // The countdown is timestamp-derived; this 1 Hz tick only re-reads it.
  useEffect(() => {
    if (!manager || view?.state !== "sleeping") return;
    const t = setInterval(() => {
      manager.tick();
      setView(manager.view());
    }, 1000);
    return () => clearInterval(t);
  }, [manager, view?.state]);

  return useMemo(() => ({ view, session, manager }), [view, session, manager]);
}
