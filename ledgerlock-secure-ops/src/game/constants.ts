export const PALETTE = {
  navy: '#0B1424',
  steel: '#1A2B43',
  cyan: '#37D7D0',
  blue: '#69A9FF',
  mint: '#9DE3B1',
  violet: '#A88BFF',
  periwinkle: '#8C9DFF',
  amber: '#FFC45E',
  coral: '#FF7183',
  white: '#F3F6FA',
} as const;
export type PaletteKey = keyof typeof PALETTE;

export const C: Record<PaletteKey, number> = Object.fromEntries(
  Object.entries(PALETTE).map(([k, v]) => [k, parseInt(v.slice(1), 16)]),
) as Record<PaletteKey, number>;

/** Isometric grid: screenX = originX + (gx - gy) * TILE_W / 2, screenY = originY + (gx + gy) * TILE_H / 2 */
export const TILE_W = 48;
export const TILE_H = 24;
/** Sprites are rendered at 2x in Blender and displayed at 1/ATLAS_SCALE. */
export const ATLAS_SCALE = 2;

/** World origin so every projected coordinate is positive (see Grid.ts). */
export const ORIGIN_X = 46 * (TILE_W / 2) + 240;
export const ORIGIN_Y = 260;
