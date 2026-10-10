import type { Cell, RoomId } from './types';
import type { TeamController } from './systems/Team';

/** What the DOM UI may ask the Phaser facility scene to do (the UI never touches Phaser objects). */
export interface SceneApi {
  selectTarget(id: string | null): void;
  useTool(): void;                        // E / "Use tool" button
  setTouchDir(dx: number, dy: number): void;
  walkTo(cell: Cell): void;
  returnToPlayer(): void;
  zoomBy(delta: number): void;
  guideToRoom(room: RoomId): { path: Cell[]; locked: boolean } | null;
  setRoutesVisible(v: boolean): void;
  routesVisible(): boolean;
  focusOn(target: string): void;
  /** Tutorial mode: pulse a beacon on these targets (empty array clears it). */
  setCoachTargets(ids: string[]): void;
  /** Manager mode and Auto-play. */
  team: TeamController;
  focusMember(id: string): void;
  flashTargets(ids: string[], ms?: number): void;
  setWaypoint(target: string): { ok: boolean; note: string };
  clearWaypoint(): void;
}
