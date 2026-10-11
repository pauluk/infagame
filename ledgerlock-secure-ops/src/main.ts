import Phaser from 'phaser';
import './styles.css';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { FacilityScene } from './game/scenes/FacilityScene';
import { DebriefScene } from './game/scenes/DebriefScene';
import { UI } from './ui/ui';
import { app } from './app';
import { keepRunningInBackground } from './background';

const ui = new UI(document.getElementById('ui')!);
app.ui = ui;

app.game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0B1424',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BootScene, MenuScene, FacilityScene, DebriefScene],
  render: { antialias: true, roundPixels: true },
  input: { keyboard: { capture: [] } },
});
keepRunningInBackground(app.game);
(window as unknown as { __ledgerlock: typeof app }).__ledgerlock = app;   // handy for debugging and the e2e test
ui.showTitle(true);
