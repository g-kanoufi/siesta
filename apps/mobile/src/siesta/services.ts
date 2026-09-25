import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoHaptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import type {
  AlarmKind,
  AlarmScheduler,
  EpochMs,
  HapticService,
  SessionStore,
  NapSessionSnapshot,
  WakePattern,
} from "@siesta/core";

const SESSION_KEY = "siesta.session.v1";

/** JSON persistence — survives restarts; holds exactly one nap. */
export class AsyncStorageSessionStore implements SessionStore {
  async load(): Promise<NapSessionSnapshot | null> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as NapSessionSnapshot;
    } catch {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  async save(session: NapSessionSnapshot): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}

/** Expo Haptics — phones get impact styles; the watch maps to its own. */
export class ExpoHapticService implements HapticService {
  private stopped = false;

  async playWake(pattern: WakePattern): Promise<void> {
    this.stopped = false;
    for (const step of pattern.steps) {
      if (this.stopped) return;
      if (step.kind === "pause") {
        await delay(step.durationMs);
      } else {
        await ExpoHaptics.impactAsync(intensityStyle(step.intensity));
        await delay(step.durationMs);
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function intensityStyle(intensity: number): ExpoHaptics.ImpactFeedbackStyle {
  if (intensity < 0.5) return ExpoHaptics.ImpactFeedbackStyle.Light;
  if (intensity < 0.85) return ExpoHaptics.ImpactFeedbackStyle.Medium;
  return ExpoHaptics.ImpactFeedbackStyle.Heavy;
}

/** expo-notifications as the durable scheduled-wake channel. */
export class ExpoAlarmScheduler implements AlarmScheduler {
  async schedule(atMs: EpochMs, kind: AlarmKind, sessionId: string): Promise<void> {
    const content =
      kind === "nap_wake"
        ? { title: "Siesta", body: "Your siesta is over." }
        : { title: "Siesta", body: "Still waiting for sleep — waking you now." };
    await Notifications.scheduleNotificationAsync({
      identifier: `${kind}-${sessionId}`,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(atMs),
        channelId: "siesta",
      },
    });
  }

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}
