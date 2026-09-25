import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { NAP_DURATION_PRESETS } from "@siesta/core";
import {
  motion,
  spacing,
  typography,
  type ColorScheme,
} from "@siesta/design-tokens";

interface DurationPickerProps {
  scheme: ColorScheme;
  selectedMinutes: number;
  onSelect: (minutes: number) => void;
}

export function DurationPicker({
  scheme,
  selectedMinutes,
  onSelect,
}: DurationPickerProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Nap duration"
    >
      {NAP_DURATION_PRESETS.map((preset) => (
        <Chip
          key={preset.id}
          scheme={scheme}
          label={preset.shortLabel}
          selected={preset.minutes === selectedMinutes}
          recommended={preset.recommended === true}
          onPress={() => onSelect(preset.minutes)}
          accessibilityLabel={`${preset.minutes} minutes`}
        />
      ))}
    </View>
  );
}

function Chip({
  scheme,
  label,
  selected,
  recommended,
  onPress,
  accessibilityLabel,
}: {
  scheme: ColorScheme;
  label: string;
  selected: boolean;
  recommended: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scale = useSharedValue(selected ? 1 : 0.92);
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    scale.value = withSpring(
      selected ? 1 : 0.92,
      motion.springStandard.spring!,
    );
  }, [selected, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pressScale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressScale.value = withSpring(0.95, motion.press.spring!);
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, motion.press.spring!);
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={
        recommended ? `${accessibilityLabel}. Recommended` : accessibilityLabel
      }
      style={styles.touch}
    >
      <Animated.View
        style={[
          styles.chip,
          animStyle,
          {
            backgroundColor: selected ? scheme.accent : scheme.surface,
            borderColor: selected ? scheme.accent : scheme.surfaceElevated,
          },
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: selected ? scheme.onAccent : scheme.textPrimary },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  touch: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: typography.body.size,
    fontWeight: "500",
  },
});
