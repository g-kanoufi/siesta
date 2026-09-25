import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { colors } from "@siesta/design-tokens";

export default function RootLayout() {
  const scheme = colors[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: scheme.background },
      }}
    />
  );
}
