import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ambient, motion, type ColorScheme } from "@siesta/design-tokens";
import type { NapState } from "@siesta/core";

interface HammockProps {
  state: NapState;
  scheme: ColorScheme;
  width?: number;
}

/**
 * Geometric hammock: two posts + a catenary dip line + a resting dot.
 * Motion comes entirely from the ambient token table — subtle or nothing.
 */
export function Hammock({ state, scheme, width = 180 }: HammockProps) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      rotation.value = 0;
      scale.value = 1;
      lift.value = 0;
      return;
    }
    if (state === "sleeping") {
      rotation.value = withRepeat(
        withSequence(
          withTiming(ambient.sway.amplitudeDegrees, {
            duration: ambient.sway.periodMs / 2,
          }),
          withTiming(-ambient.sway.amplitudeDegrees, {
            duration: ambient.sway.periodMs / 2,
          }),
        ),
        -1,
      );
    } else if (state === "waiting_for_sleep") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1 + ambient.breathe.amplitudeScale, {
            duration: ambient.breathe.periodMs / 2,
          }),
          withTiming(1, { duration: ambient.breathe.periodMs / 2 }),
        ),
        -1,
      );
    } else if (state === "waking" || state === "completed") {
      lift.value = withSequence(
        withSpring(-14, ambient.rise.spring),
        withSpring(0, motion.springGentle.spring!),
      );
    } else if (state === "armed") {
      scale.value = withSpring(0.97, motion.springBounce.spring!);
    } else {
      rotation.value = withSpring(0, motion.springGentle.spring!);
      scale.value = withSpring(1, motion.springGentle.spring!);
      lift.value = withSpring(0, motion.springGentle.spring!);
    }
  }, [state, reducedMotion, rotation, scale, lift]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
      { translateY: lift.value },
    ],
  }));

  const postStyle = [
    styles.post,
    { backgroundColor: scheme.textTertiary },
  ];

  return (
    <Animated.View
      style={[styles.canvas, { width, height: width * 0.45 }, animatedStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={[styles.sheet, {
        width: width * 0.78,
        borderColor: scheme.accent,
        borderBottomWidth: 3,
        borderBottomLeftRadius: width * 0.4,
        borderBottomRightRadius: width * 0.4,
      }]} />
      <View style={postStyle} />
      <View style={postStyle} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexDirection: "row",
    paddingHorizontal: 2,
  },
  post: {
    width: 3,
    height: 26,
    borderRadius: 2,
  },
  sheet: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    height: 34,
    backgroundColor: "transparent",
  },
});
