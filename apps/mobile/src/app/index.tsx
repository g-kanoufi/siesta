import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@siesta/design-tokens";
import { SunsetBackdrop } from "../components/SunsetBackdrop";
import siestaIcon from "../../assets/icon.png";

export default function Home() {
  const mode = useColorScheme() === "dark" ? "dark" : "light";
  const scheme = colors[mode];

  return (
    <SunsetBackdrop mode={mode}>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Image
              source={siestaIcon}
              style={styles.brandIcon}
              accessibilityLabel="Siesta hammock logo"
            />
            <Text style={[styles.wordmark, { color: scheme.textPrimary }]}>siesta</Text>
          </View>
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="button"
              style={StyleSheet.flatten([
                styles.settingsButton,
                { backgroundColor: scheme.surface, borderColor: scheme.surfaceElevated },
              ])}
            >
              <Text style={[styles.settingsText, { color: scheme.textSecondary }]}>Settings</Text>
            </Pressable>
          </Link>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.eyebrow, { color: scheme.accent }]}>A NAP TIMER FOR YOUR WRIST</Text>
          <Text style={[styles.title, { color: scheme.textPrimary }]}>Sleep first.{"\n"}Count down second.</Text>
          <Text style={[styles.lede, { color: scheme.textSecondary }]}>
            Choose a duration for a nap or quiet pause. Siesta uses heart-rate trends to estimate when sleep may begin, then starts counting.
          </Text>

          <View
            style={[
              styles.stepsCard,
              {
                backgroundColor: scheme.surface,
                borderColor: scheme.surfaceElevated,
                shadowColor: mode === "dark" ? "#000000" : "#593B33",
                shadowOpacity: mode === "dark" ? 0.18 : 0.08,
              },
            ]}
          >
            <Step number="01" title="Choose" detail="Set your usual duration in Settings; it carries over to Apple Watch." scheme={scheme} />
            <Step number="02" title="Settle" detail="Daydream, rest, or drift off. Your watch estimates sleep onset from heart-rate trends." scheme={scheme} />
            <Step number="03" title="Wake" detail="A fail-safe wake is set when you start." scheme={scheme} />
          </View>

          <View style={styles.notes}>
            <Text style={[styles.privacy, { color: scheme.textTertiary }]}>
              At first start, Apple Health asks permission to share heart-rate data. Siesta only reads it to estimate sleep onset and never writes health data.
            </Text>
            <Text style={[styles.privacy, { color: scheme.textTertiary }]}>
              Only heart-rate data is read on your watch and discarded after the session. A very still daydream or meditation can resemble sleep and start the countdown early. No account, ads, analytics, or backend; sleep detection is an estimate, not a medical measurement.
            </Text>
          </View>

          <Text style={[styles.watchNote, { color: scheme.textSecondary }]}>
            Start and manage your siesta from the Apple Watch app or its watch-face complication.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </SunsetBackdrop>
  );
}

function Step({
  number,
  title,
  detail,
  scheme,
}: {
  number: string;
  title: string;
  detail: string;
  scheme: (typeof colors)["light"];
}) {
  return (
    <View style={styles.step}>
      <Text style={[styles.stepNumber, { color: scheme.accent }]}>{number}</Text>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, { color: scheme.textPrimary }]}>{title}</Text>
        <Text style={[styles.stepDetail, { color: scheme.textSecondary }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 68,
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandIcon: { width: 40, height: 40, borderRadius: 12 },
  wordmark: { fontSize: typography.title.size, fontWeight: "600", letterSpacing: -0.5 },
  settingsButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settingsText: { fontSize: typography.supporting.size, fontWeight: "500" },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  eyebrow: { fontSize: typography.caption.size, letterSpacing: 2, fontWeight: "600" },
  title: {
    fontSize: typography.title.size * 1.45,
    fontWeight: "600",
    lineHeight: typography.title.size * 1.56,
    letterSpacing: -1.2,
  },
  lede: { fontSize: typography.body.size, lineHeight: typography.body.size * 1.5 },
  stepsCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 2,
  },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  stepNumber: { fontSize: typography.supporting.size, fontWeight: "600", paddingTop: 2 },
  stepCopy: { flex: 1, gap: spacing.xxs },
  stepTitle: { fontSize: typography.supporting.size, fontWeight: "600" },
  stepDetail: { fontSize: typography.supporting.size, lineHeight: typography.supporting.size * 1.4 },
  notes: { gap: spacing.sm },
  privacy: { fontSize: typography.caption.size, lineHeight: typography.caption.size * 1.45 },
  watchNote: { fontSize: typography.supporting.size, fontWeight: "500", lineHeight: typography.supporting.size * 1.4 },
});
