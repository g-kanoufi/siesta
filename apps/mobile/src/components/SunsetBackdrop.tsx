import type { ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { colors, sunsetGradient } from "@siesta/design-tokens";

export function SunsetBackdrop({ mode, children }: { mode: keyof typeof sunsetGradient; children: ReactNode }) {
  const rootStyle = StyleSheet.flatten([styles.root, { backgroundColor: colors[mode].background }]);

  return (
    <View style={rootStyle}>
      <LinearGradient
        colors={sunsetGradient[mode]}
        locations={[0, 0.34, 0.72, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.88, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
