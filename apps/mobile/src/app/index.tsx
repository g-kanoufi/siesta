import React from "react";
import { StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NAP_DURATION_PRESETS,
  presetFor,
  type NapState,
} from "@siesta/core";
import { colors, spacing, typography } from "@siesta/design-tokens";
import { DurationPicker } from "../components/DurationPicker";
import { Hammock } from "../components/Hammock";
import { PrimaryButton } from "../components/PrimaryButton";
import { sleepDetector, useNap } from "../siesta/session";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusCopy(state: NapState): string {
  switch (state) {
    case "waiting_for_sleep":
      return "Waiting for sleep…";
    case "sleeping":
      return "Sleeping";
    case "waking":
      return "Welcome back.";
    case "completed":
      return "Welcome back.";
    default:
      return "";
  }
}

export default function Home() {
  const scheme = colors[useColorScheme() === "dark" ? "dark" : "light"];
  const { view, manager } = useNap();
  const [selected, setSelected] = React.useState(20);

  if (!view || !manager) {
    return <View style={[styles.root, { backgroundColor: scheme.background }]} />;
  }

  const state = view.state;
  const settled = state === "idle" || state === "selecting_duration";
  const inFlight =
    state === "armed" || state === "waiting_for_sleep" || state === "sleeping";
  const preset = presetFor(view.selectedDurationMinutes ?? selected);

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: scheme.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.hero}>
        <Hammock state={state} scheme={scheme} />
        {settled && (
          <>
            <Text
              style={[styles.heroNumber, { color: scheme.textPrimary }]}
              accessibilityLabel={`${selected} minutes`}
            >
              {selected}
              <Text style={styles.heroUnit}> min</Text>
            </Text>
            <Text style={[styles.supporting, { color: scheme.textSecondary }]}>
              {preset?.description ?? "Your nap"}
            </Text>
          </>
        )}
        {inFlight && (
          <>
            <Text
              style={[styles.status, { color: scheme.textSecondary }]}
              accessibilityLiveRegion="polite"
            >
              {statusCopy(state)}
            </Text>
            {state === "sleeping" && view.remainingMs !== null && (
              <Text
                style={[styles.heroNumber, { color: scheme.textPrimary }]}
                accessibilityLabel={`${Math.ceil(view.remainingMs / 60000)} minutes remaining`}
              >
                {formatRemaining(view.remainingMs)}
              </Text>
            )}
            {state === "waiting_for_sleep" && view.nextDeadlineMs !== null && (
              <Text style={[styles.supporting, { color: scheme.textTertiary }]}>
                We&apos;ll wake you by{" "}
                {new Date(view.nextDeadlineMs).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                at the latest.
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.controls}>
        {settled && (
          <>
            <DurationPicker
              scheme={scheme}
              selectedMinutes={selected}
              onSelect={(m) => {
                setSelected(m);
                manager.selectDuration(m);
              }}
            />
            <PrimaryButton
              scheme={scheme}
              label="Start siesta"
              accessibilityHint="Arms sleep detection; the countdown begins when you fall asleep"
              onPress={() => {
                manager.selectDuration(selected);
                void manager.start();
              }}
            />
          </>
        )}

        {inFlight && (
          <>
            <PrimaryButton
              scheme={scheme}
              label="Cancel"
              variant="quiet"
              onPress={() => void manager.cancel()}
            />
            {__DEV__ && state === "waiting_for_sleep" && (
              <PrimaryButton
                scheme={scheme}
                label="Simulate sleep (dev)"
                variant="quiet"
                onPress={() => sleepDetector.simulateSleep(Date.now())}
              />
            )}
          </>
        )}

        {(state === "waking" || state === "completed") && (
          <PrimaryButton
            scheme={scheme}
            label={state === "waking" ? "I'm awake" : "Done"}
            onPress={() => {
              if (state === "waking") manager.acknowledgeWake();
              void manager.dismiss();
            }}
          />
        )}

        {state === "cancelled" && (
          <PrimaryButton
            scheme={scheme}
            label="Done"
            onPress={() => void manager.dismiss()}
          />
        )}

        {state === "error" && (
          <>
            <Text style={[styles.supporting, { color: scheme.textSecondary }]}>
              We couldn&apos;t access sleep data. You can still start a plain
              timer.
            </Text>
            <PrimaryButton
              scheme={scheme}
              label="Start without detection"
              onPress={() => {
                void manager.dismiss().then(() => {
                  manager.selectDuration(selected);
                  void manager.startManually();
                });
              }}
            />
            <PrimaryButton
              scheme={scheme}
              label="Try again"
              variant="quiet"
              onPress={() => void manager.dismiss()}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  heroNumber: {
    fontSize: typography.heroNumber.size,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  heroUnit: {
    fontSize: typography.heroUnit.size,
    fontWeight: "500",
  },
  status: {
    fontSize: typography.body.size,
  },
  supporting: {
    fontSize: typography.supporting.size,
    textAlign: "center",
  },
  controls: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
});
