/**
 * Semantic color tokens. Hex values only — components never invent colors.
 * Warmth is the identity: paper & linen in light, ember-dark in dark.
 * Dark mode is designed, not "black": deepest warm charcoal, never #000.
 */
export interface ColorScheme {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  /** Used while waiting/sleeping — signals "dim, rest now". */
  scrim: string;
}

export const light: ColorScheme = {
  background: "#FAF6EF",
  surface: "#FFFDF8",
  surfaceElevated: "#F1EAE0",
  textPrimary: "#231E16",
  textSecondary: "#6B6252",
  textTertiary: "#8F8571",
  accent: "#BF7433",
  onAccent: "#26180A",
  accentSoft: "#F0DEC9",
  success: "#5F7F57",
  warning: "#9A7A2E",
  danger: "#A8503F",
  scrim: "#EDE5D7",
};

export const dark: ColorScheme = {
  background: "#161310",
  surface: "#201B16",
  surfaceElevated: "#2B241C",
  textPrimary: "#F3EDE3",
  textSecondary: "#B3A894",
  textTertiary: "#7F7666",
  accent: "#E8A15C",
  onAccent: "#2A1C0D",
  accentSoft: "#3B2E1E",
  success: "#9DBE95",
  warning: "#E3C983",
  danger: "#DE8A76",
  scrim: "#0E0C0A",
};

export const colors = { light, dark } as const;
