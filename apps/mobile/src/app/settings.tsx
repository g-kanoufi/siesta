import React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@siesta/design-tokens";
import { DurationPicker } from "../components/DurationPicker";
import { SunsetBackdrop } from "../components/SunsetBackdrop";
import { getDefaultDuration, setDefaultDuration } from "../siesta/defaultDuration";

const legalLinks = [
  { label: "Privacy policy", url: "https://siesta.app/privacy" },
  { label: "Terms of sale (CGV)", url: "https://siesta.app/cgv" },
];

export default function Settings() {
  const mode = useColorScheme() === "dark" ? "dark" : "light";
  const scheme = colors[mode];
  const [selectedMinutes, setSelectedMinutes] = React.useState(20);

  React.useEffect(() => {
    let active = true;
    void getDefaultDuration().then((minutes) => {
      if (active) setSelectedMinutes(minutes);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SunsetBackdrop mode={mode}>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Link href="/" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to Siesta">
              <Text style={[styles.back, { color: scheme.textSecondary }]}>‹ Siesta</Text>
            </Pressable>
          </Link>
          <Text style={[styles.headerTitle, { color: scheme.textPrimary }]}>Settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.eyebrow, { color: scheme.accent }]}>YOUR SIESTA</Text>
          <Text style={[styles.title, { color: scheme.textPrimary }]}>A time that feels right.</Text>
          <Text style={[styles.body, { color: scheme.textSecondary }]}>Choose the duration Siesta will remember for your next nap.</Text>

          <View
            style={[
              styles.durationCard,
              {
                backgroundColor: scheme.surface,
                borderColor: scheme.surfaceElevated,
                shadowColor: mode === "dark" ? "#000000" : "#593B33",
                shadowOpacity: mode === "dark" ? 0.18 : 0.08,
              },
            ]}
          >
            <Text style={[styles.durationLabel, { color: scheme.textSecondary }]}>DEFAULT DURATION</Text>
            <Text style={[styles.durationValue, { color: scheme.accent }]}>{selectedMinutes} min</Text>
            <DurationPicker
              scheme={scheme}
              selectedMinutes={selectedMinutes}
              onSelect={(minutes) => {
                setSelectedMinutes(minutes);
                void setDefaultDuration(minutes);
              }}
            />
            <Text style={[styles.caption, { color: scheme.textTertiary }]}>
              {Platform.OS === "ios" ? "Shared with Siesta on your Apple Watch." : "Saved on this device."}
            </Text>
          </View>

          <View style={styles.legalSection}>
            <Text style={[styles.sectionTitle, { color: scheme.textPrimary }]}>Legal & privacy</Text>
            <View style={[styles.legalCard, { backgroundColor: scheme.surface, borderColor: scheme.surfaceElevated }]}>
              {legalLinks.map((link, index) => (
                <Pressable
                  key={link.url}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(link.url)}
                  style={[
                    styles.linkRow,
                    index < legalLinks.length - 1 && { borderBottomColor: scheme.surfaceElevated, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text style={[styles.linkText, { color: scheme.textSecondary }]}>{link.label}</Text>
                  <Text style={[styles.chevron, { color: scheme.textTertiary }]}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.purchaseNote, { color: scheme.textTertiary }]}>
            {Platform.OS === "ios"
              ? "Siesta is a one-time paid app. Your Apple Account manages your download and purchase history."
              : "Siesta is a one-time paid app. Your store account manages your download and purchase history."}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </SunsetBackdrop>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
  },
  back: { fontSize: typography.action.size },
  headerTitle: { fontSize: typography.action.size, fontWeight: "600" },
  headerSpacer: { width: 48 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.md },
  eyebrow: { fontSize: typography.caption.size, letterSpacing: 2, fontWeight: "600" },
  title: { fontSize: typography.title.size * 1.25, fontWeight: "600", lineHeight: typography.title.size * 1.4 },
  body: { fontSize: typography.body.size, lineHeight: typography.body.size * 1.5 },
  durationCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.sm,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 2,
  },
  durationLabel: { fontSize: typography.caption.size, letterSpacing: 1.6, fontWeight: "600" },
  durationValue: { fontSize: typography.heroNumber.size * 0.82, fontWeight: "600", fontVariant: ["tabular-nums"] },
  caption: { fontSize: typography.caption.size, textAlign: "center", lineHeight: typography.caption.size * 1.4 },
  legalSection: { marginTop: spacing.md, gap: spacing.xs },
  sectionTitle: { fontSize: typography.supporting.size, fontWeight: "600" },
  legalCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: spacing.md },
  linkRow: { minHeight: 52, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkText: { fontSize: typography.body.size },
  chevron: { fontSize: 24 },
  purchaseNote: { fontSize: typography.caption.size, lineHeight: typography.caption.size * 1.5, marginTop: spacing.md },
});
