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
import paymentsDown from './paymentsDown';
import risingWater from './risingWater';
import floodGates from './floodGates';
import quietMalware from './quietMalware';
import ransomNote from './ransomNote';
import wormInTheWires from './wormInTheWires';

/** Campaign order 1-8, the business-continuity track 9-11 (unlocked after the tutorial), then the side-task hub. */
export const MISSIONS: MissionDef[] = [duplicateGhost, bacsAfterDark, collectionConnection, eventStreamTide, fabricMirror, tokenOnTheTable, cleanRestore, rootOfTheRipple, paymentsDown, risingWater, floodGates, quietMalware, ransomNote, wormInTheWires, opsFloor];
export const CAMPAIGN_MISSIONS = MISSIONS.filter((m) => m.order > 0);
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<string, MissionDef>;
export const CAMPAIGN_GOAL = 'Protect the fictional finance service while keeping valid payments, debt receipts and reporting accurate and available.';
