import type { MissionDef } from './types';
import duplicateGhost from './duplicateGhost';
import { bacsAfterDark, collectionConnection, eventStreamTide, fabricMirror } from './followOns';

export const MISSIONS: MissionDef[] = [duplicateGhost, bacsAfterDark, collectionConnection, eventStreamTide, fabricMirror];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<string, MissionDef>;
