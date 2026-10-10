import type { IncidentDef } from './types';
import duplicateGhost from './duplicateGhost';
import bacs from './bacsAfterDark';
import collection from './collectionConnection';
import tide from './eventStreamTide';
import fabric from './fabricMirror';
import token from './tokenOnTheTable';
import restore from './cleanRestore';
import ripple from './rootOfTheRipple';

/** Incident Board data per mission. The hub (Operations Floor) has no active incident. */
export const INCIDENTS: IncidentDef[] = [...duplicateGhost, ...bacs, ...collection, ...tide, ...fabric, ...token, ...restore, ...ripple];
export const INCIDENTS_BY_MISSION: Record<string, IncidentDef[]> = {};
for (const i of INCIDENTS) (INCIDENTS_BY_MISSION[i.missionId] ??= []).push(i);
export const INCIDENT_BY_ID = Object.fromEntries(INCIDENTS.map((i) => [i.incidentId, i])) as Record<string, IncidentDef>;
