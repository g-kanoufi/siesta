/** 4pt grid. pt on Apple, dp on Wear OS — the scale is shared. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  screen: 40,
} as const;

export const radii = {
  /** Buttons and interactive pills — fully rounded. */
  pill: 999,
  card: 16,
  /** Hammock canvas corners if it ever sits on a surface. */
  subtle: 8,
} as const;
