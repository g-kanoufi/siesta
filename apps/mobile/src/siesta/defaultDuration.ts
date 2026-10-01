import AsyncStorage from "@react-native-async-storage/async-storage";
import { ExtensionStorage } from "@bacons/apple-targets";
import { Platform } from "react-native";
import { NAP_DURATION_PRESETS } from "@siesta/core";

const key = "siesta.defaultDurationMinutes";
const appGroup = "group.app.siesta";
const sharedStorage = Platform.OS === "ios" ? new ExtensionStorage(appGroup) : null;

export async function getDefaultDuration(): Promise<number> {
  const sharedValue = sharedStorage?.get(key);
  const storedValue = sharedValue ?? await AsyncStorage.getItem(key);
  const minutes = Number(storedValue);
  return NAP_DURATION_PRESETS.some((preset) => preset.minutes === minutes)
    ? minutes
    : 20;
}

export async function setDefaultDuration(minutes: number): Promise<void> {
  if (sharedStorage) {
    sharedStorage.set(key, minutes);
    return;
  }
  await AsyncStorage.setItem(key, String(minutes));
}
