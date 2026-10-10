import type Phaser from 'phaser';
import type { UI } from './ui/ui';
import type { GameState } from './game/systems/GameState';
import { FabricService } from './integrations/fabric';

/** Tiny application singleton shared by the DOM UI and the Phaser scenes (no gameplay logic lives here). */
export const app: {
  game: Phaser.Game | null;
  ui: UI | null;
  fabric: FabricService;
  startMission(id: string): void;
  openDebrief(state: GameState): void;
} = {
  game: null,
  ui: null,
  fabric: new FabricService(),
  startMission(id) { app.ui?.startMission(id); },
  openDebrief(state) { app.ui?.showDebrief(state); },
};
