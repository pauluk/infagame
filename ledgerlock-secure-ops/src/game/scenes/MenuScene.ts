import Phaser from 'phaser';
import { C } from '../constants';
import { makeImage } from '../art';
import { settings } from '../systems/Settings';

/** Backdrop for the DOM title / mission-select / debrief screens: a slowly drifting isometric grid with a few rendered sprites. */
export class MenuScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Image[] = [];
  constructor() { super('Menu'); }
  create(): void {
    this.cameras.main.setBackgroundColor(0x0b1424);
    this.g = this.add.graphics();
    const frames = ['i_rack_cyan', 'i_console_ledger', 'i_node_gold', 'i_cabinet_secure', 'i_terminal_card', 'i_screen_dashboard', 'i_console_payment'];
    frames.forEach((f, i) => {
      const img = makeImage(this, 'props', f, 0, 0).setScale(1.4).setAlpha(0.9);
      img.setData('i', i); this.sprites.push(img);
    });
    const eng = makeImage(this, 'characters', 'eng_se_idle_0', 0, 0).setScale(2.2);
    eng.setData('i', 99); this.sprites.push(eng);
    this.scale.on('resize', () => this.layout());
    this.layout();
  }
  private layout(): void {
    const w = this.scale.width, h = this.scale.height;
    this.sprites.forEach((s) => {
      const i = s.getData('i') as number;
      if (i === 99) s.setPosition(w * 0.5, h * 0.78);
      else s.setPosition(w * (0.12 + (i % 4) * 0.25), h * (i < 4 ? 0.3 : 0.55) + (i % 2) * 24);
    });
  }
  override update(time: number): void {
    const w = this.scale.width, h = this.scale.height;
    const g = this.g; g.clear();
    const off = settings.data.reducedMotion ? 0 : (time / 40) % 48;
    g.lineStyle(1, C.steel, 0.9);
    for (let i = -20; i < 40; i++) {
      const x = i * 48 + off;
      g.lineBetween(x, 0, x + h * 2, h);
      g.lineBetween(x, h, x + h * 2, 0);
    }
    this.sprites.forEach((s) => { const i = s.getData('i') as number; if (!settings.data.reducedMotion) s.y += Math.sin(time / 600 + i) * 0.12; });
  }
}
