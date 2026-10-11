import type { IncidentDef } from './types';
import duplicateGhost from './duplicateGhost';
import bacs from './bacsAfterDark';
import collection from './collectionConnection';
import tide from './eventStreamTide';
import fabric from './fabricMirror';
import token from './tokenOnTheTable';
import restore from './cleanRestore';
import ripple from './rootOfTheRipple';
import payments from './paymentsDown';
import water from './risingWater';
import gates from './floodGates';

/** Incident Board data per mission. The hub (Operations Floor) has no active incident. */
export const INCIDENTS: IncidentDef[] = [...duplicateGhost, ...bacs, ...collection, ...tide, ...fabric, ...token, ...restore, ...ripple, ...payments, ...water, ...gates];
export const INCIDENTS_BY_MISSION: Record<string, IncidentDef[]> = {};
for (const i of INCIDENTS) (INCIDENTS_BY_MISSION[i.missionId] ??= []).push(i);
export const INCIDENT_BY_ID = Object.fromEntries(INCIDENTS.map((i) => [i.incidentId, i])) as Record<string, IncidentDef>;
