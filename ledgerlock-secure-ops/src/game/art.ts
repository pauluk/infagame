import Phaser from 'phaser';
import { ATLAS_SCALE } from './constants';

export const ATLAS_GROUPS = ['environment', 'props', 'characters', 'effects', 'ui'] as const;
export type AtlasGroup = (typeof ATLAS_GROUPS)[number];
const base = () => import.meta.env.BASE_URL;

export function preloadAtlases(scene: Phaser.Scene): void {
  for (const g of ATLAS_GROUPS) scene.load.atlas(g, `${base()}assets/${g}/atlas.png`, `${base()}assets/${g}/atlas.json`);
}

/** True if the Blender-rendered atlas frame exists. */
export const hasFrame = (scene: Phaser.Scene, group: AtlasGroup, frame: string) =>
  scene.textures.exists(group) && scene.textures.get(group).has(frame);

/**
 * Create an image from a rendered atlas frame. If the atlas (or frame) is missing, a clearly-labelled PLACEHOLDER
 * diamond/box is generated locally instead so the game stays playable. Real art is never faked: placeholders are
 * flat, unlabelled-by-art boxes and the console warns once.
 */
export function makeImage(scene: Phaser.Scene, group: AtlasGroup, frame: string, x: number, y: number): Phaser.GameObjects.Image {
  if (hasFrame(scene, group, frame)) {
    const img = scene.add.image(x, y, group, frame);
    img.setScale(1 / ATLAS_SCALE);
    return img;
  }
  return placeholder(scene, frame, x, y);
}

const warned = new Set<string>();
function placeholder(scene: Phaser.Scene, frame: string, x: number, y: number): Phaser.GameObjects.Image {
  if (!warned.has(frame)) { warned.add(frame); console.warn(`[ledgerlock] Rendered art frame "${frame}" missing: using a PLACEHOLDER shape. Run \`npm run assets:render\` (needs Blender).`); }
  const key = 'ph_' + frame.replace(/[^a-z]/gi, '').slice(0, 6) + (frame.startsWith('floor') ? 'f' : frame.startsWith('wall') || frame.startsWith('door') ? 'w' : frame.startsWith('eng') ? 'c' : 'p');
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const kind = key.slice(-1);
    if (kind === 'f') { g.fillStyle(0x6e86a6, 1).fillPoints([new Phaser.Geom.Point(24, 0), new Phaser.Geom.Point(48, 12), new Phaser.Geom.Point(24, 24), new Phaser.Geom.Point(0, 12)], true); g.generateTexture(key, 48, 24); }
    else if (kind === 'c') { g.fillStyle(0x37d7d0, 1).fillRoundedRect(8, 0, 16, 36, 6); g.fillStyle(0xf3f6fa, 1).fillCircle(16, 8, 6); g.generateTexture(key, 32, 40); }
    else { const h = kind === 'w' ? 30 : 34; g.fillStyle(0x5b7190, 1).fillRect(6, 0, 28, h); g.fillStyle(0x1a2b43, 1).fillRect(6, 0, 28, 6); g.lineStyle(1, 0xf3f6fa, 0.5).strokeRect(6, 0, 28, h); g.generateTexture(key, 40, 40); }
    g.destroy();
  }
  const img = scene.add.image(x, y, key);
  img.setOrigin(0.5, key.endsWith('f') ? 0.5 : 0.9);
  return img;
}

export function frameExists(scene: Phaser.Scene, group: AtlasGroup, frame: string) { return hasFrame(scene, group, frame); }
