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
  background: "#F4F0E8",
  surface: "#FBF8F1",
  surfaceElevated: "#ECE3D6",
  textPrimary: "#322B25",
  textSecondary: "#574B41",
  textTertiary: "#5B5148",
  accent: "#A8623F",
  onAccent: "#FFFFFF",
  accentSoft: "#EED9C4",
  success: "#54745A",
  warning: "#8C652E",
  danger: "#A84940",
  scrim: "#E7DDCF",
};

export const dark: ColorScheme = {
  background: "#20252B",
  surface: "#2B3036",
  surfaceElevated: "#3A4046",
  textPrimary: "#F2EEE6",
  textSecondary: "#E0D8CE",
  textTertiary: "#B8B0A7",
  accent: "#D69B6E",
  onAccent: "#2D231D",
  accentSoft: "#493D36",
  success: "#B0CF9F",
  warning: "#F1C67A",
  danger: "#F3A094",
  scrim: "#1B1F24",
};

/**
 * The sunset sky — Siesta's signature gradient, golden hour sliding into
 * dusk. Flat fills above; these are only ever used as gradient stops
 * (watch faces, the site sky, the app icon), never as solid UI color.
 */
export const sunset = {
  /** Highest point of the sky — first to fade. */
  zenith: "#20324E",
  /** Deep navy band that echoes the hammock mark. */
  rose: "#20324E",
  /** Coral mid-band — the warm heart of the gradient. */
  coral: "#6B4F47",
  /** The warmest glow before the sky fades into plum. */
  ember: "#765749",
  /** Where the light dies into the charcoal base. */
  horizon: "#20252B",
} as const;

export const sunsetLight = {
  zenith: "#A6B8D2",
  rose: "#BBC9DC",
  coral: "#E3C39E",
  ember: "#F2D6B6",
  horizon: "#F4F0E8",
} as const;

export const logoSunset = {
  dawn: "#F4C56C",
  ember: "#E88758",
  dusk: "#687F9A",
} as const;

export const sunsetGradient = {
  light: [sunsetLight.ember, sunsetLight.coral, sunsetLight.rose, light.background],
  dark: [sunset.ember, sunset.coral, sunset.rose, dark.background],
} as const;

export const colors = { light, dark } as const;

export const brand = {
  hammockNavy: "#20324E",
  hammockShade: "#101E36",
} as const;
