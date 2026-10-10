import Phaser from 'phaser';
import { PALETTE } from '../constants';
import { preloadAtlases } from '../art';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload(): void {
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.graphics();
    const label = this.add.text(w / 2, h / 2 - 28, 'Loading rendered art…', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: PALETTE.white }).setOrigin(0.5);
    this.load.on('progress', (p: number) => { bar.clear().fillStyle(0x1a2b43).fillRect(w / 2 - 120, h / 2, 240, 8).fillStyle(0x37d7d0).fillRect(w / 2 - 120, h / 2, 240 * p, 8); });
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('[ledgerlock] could not load', f.key, f.url));
    this.load.on('complete', () => label.destroy());
    preloadAtlases(this);
  }
  create(): void { this.scene.start('Menu'); }
}
