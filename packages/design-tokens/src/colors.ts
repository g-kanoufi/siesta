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
  background: "#1C1522",
  surface: "#261C30",
  surfaceElevated: "#332542",
  textPrimary: "#FBF2E4",
  textSecondary: "#D3BFB2",
  textTertiary: "#A08FA8",
  accent: "#F5A36E",
  onAccent: "#301A20",
  accentSoft: "#40283E",
  success: "#A8C68F",
  warning: "#F0C97B",
  danger: "#EE8B73",
  scrim: "#130E1A",
};

/**
 * The sunset sky — Siesta's signature gradient, golden hour sliding into
 * dusk. Flat fills above; these are only ever used as gradient stops
 * (watch faces, the site sky, the app icon), never as solid UI color.
 */
export const sunset = {
  /** Highest point of the sky — first to fade. */
  zenith: "#2E1F3E",
  /** Rose band where dusk meets gold. */
  rose: "#B85C7A",
  /** Coral mid-band — the warm heart of the gradient. */
  coral: "#F27B5E",
  /** The sun itself — deepest gold, sits lowest on the horizon. */
  ember: "#FFC478",
  /** Where the light dies into the plum base. */
  horizon: "#4A2C4E",
} as const;

export const colors = { light, dark } as const;
