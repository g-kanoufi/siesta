import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  motion,
  spacing,
  typography,
  type ColorScheme,
} from "@siesta/design-tokens";

interface PrimaryButtonProps {
  scheme: ColorScheme;
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  variant?: "primary" | "quiet";
}

export function PrimaryButton({
  scheme,
  label,
  onPress,
  accessibilityHint,
  variant = "primary",
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, motion.press.spring!);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.press.spring!);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={styles.touch}
    >
      <Animated.View
        style={[
          styles.button,
          animStyle,
          isPrimary
            ? { backgroundColor: scheme.accent }
            : { backgroundColor: "transparent" },
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: isPrimary ? scheme.onAccent : scheme.textSecondary },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    minHeight: 48,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  button: {
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  label: {
    fontSize: typography.action.size,
    fontWeight: "600",
  },
});
