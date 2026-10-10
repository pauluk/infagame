import type { MissionDef } from './types';
import duplicateGhost from './duplicateGhost';
import bacsAfterDark from './bacsAfterDark';
import collectionConnection from './collectionConnection';
import eventStreamTide from './eventStreamTide';
import fabricMirror from './fabricMirror';
import tokenOnTheTable from './tokenOnTheTable';
import cleanRestore from './cleanRestore';
import rootOfTheRipple from './rootOfTheRipple';
import opsFloor from './opsFloor';

/** Campaign order 1-8, then the side-task hub. */
export const MISSIONS: MissionDef[] = [duplicateGhost, bacsAfterDark, collectionConnection, eventStreamTide, fabricMirror, tokenOnTheTable, cleanRestore, rootOfTheRipple, opsFloor];
export const CAMPAIGN_MISSIONS = MISSIONS.filter((m) => m.order > 0);
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<string, MissionDef>;
export const CAMPAIGN_GOAL = 'Protect the fictional finance service while keeping valid payments, debt receipts and reporting accurate and available.';
