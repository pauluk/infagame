import type { RoomId } from '../types';
import type { GameState } from './GameState';
import { ROOMS } from '../../data/map';

/**
 * What the player has discovered. Visited rooms are revealed; so is the room they started in, and any room the incident points
 * at (the Incident Wall names it). Everything else shows only as a silhouette with no name and no equipment.
 */
export function isKnown(s: GameState, room: RoomId): boolean {
  if (s.flags['visited_' + room] || room === s.mission.startRoom) return true;
  if (room === s.mission.alert.points) return true;
  return s.mission.evidence.some((e) => e.sourceRoom === room && s.evidence.has(e.id));
}
export const knownRooms = (s: GameState): RoomId[] => ROOMS.filter((r) => isKnown(s, r.id)).map((r) => r.id);
export const discoveredCount = (s: GameState) => ({ known: knownRooms(s).length, total: ROOMS.length });
