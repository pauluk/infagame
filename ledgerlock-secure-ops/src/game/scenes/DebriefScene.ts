import Phaser from 'phaser';
import { makeImage } from '../art';

/** Celebratory backdrop behind the DOM debrief card. */
export class DebriefScene extends Phaser.Scene {
  constructor() { super('Debrief'); }
  create(): void {
    this.cameras.main.setBackgroundColor(0x0b1424);
    const w = this.scale.width, h = this.scale.height;
    const eng = makeImage(this, 'characters', 'eng_se_success_0', w * 0.82, h * 0.78).setScale(3);
    let i = 0;
    this.time.addEvent({ delay: 140, loop: true, callback: () => { i = (i + 1) % 4; const f = `eng_se_success_${i}`; if (this.textures.get('characters').has(f)) eng.setFrame(f); } });
    makeImage(this, 'effects', 'fx_success', w * 0.82, h * 0.7).setScale(2);
  }
}
