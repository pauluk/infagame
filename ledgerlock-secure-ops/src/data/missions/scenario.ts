import type { ContainmentCfg, MissionDef, Rule } from './types';
import type { GameState } from '../../game/systems/GameState';
import type { EvidenceDef, PassId, RoomId, Tone } from '../../game/types';
import { PASSES } from '../passes';
import { propTarget, routeTarget } from '../targets';
import { ROOM_BY_ID } from '../map';

export interface ScenarioSpec {
  id: string; title: string; tagline: string; difficulty: string;
  pointsRoom: RoomId; route: string;
  clock: [start: string, deadline: string, label: string]; parSeconds: number;
  alert: { severity: string; headline: string; symptoms: string[]; impact: string };
  briefing: string[];
  /** The two rooms visited, their passes, the prop that carries each piece of evidence, and the scan target in room 1. */
  r1: { room: RoomId; pass: PassId; scan: string; scanText: string; evidenceProp: string; evidence: Omit<EvidenceDef, 'sourceRoom' | 'requiredPass'>; evidenceRows: [string, string][]; evidenceBody: string };
  r2: { room: RoomId; pass: PassId; evidenceProp: string; evidence: Omit<EvidenceDef, 'sourceRoom' | 'requiredPass'>; evidenceRows: [string, string][]; evidenceBody: string };
  lens: { steps: { time: string; text: string; tone: Tone }[]; conclusion: string };
  responseProp: string;
  responses: { id: string; label: string; detail: string; narrow: number; correct: boolean; result: string; availabilityHit?: number; hitSeconds?: number; integrity?: number; protection?: number }[];
  freshnessEffect?: 'mirrorStuck' | 'silverLag';
  outline: NonNullable<MissionDef['outline']>;
  debrief: { what: string; learn: string };
}

const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Builds a playable, simplified scenario on the same engine as the tutorial: passes, evidence, lens, response choice, verification, report. */
export function makeScenario(sp: ScenarioSpec): MissionDef {
  const feed = routeTarget(sp.route);
  const ev1 = { ...sp.r1.evidence, sourceRoom: sp.r1.room, requiredPass: sp.r1.pass } as EvidenceDef;
  const ev2 = { ...sp.r2.evidence, sourceRoom: sp.r2.room, requiredPass: sp.r2.pass } as EvidenceDef;
  const rules: Rule[] = [
    { tool: 'scanner', target: sp.r1.scan, run: (a) => { a.flag('scanned'); a.status(sp.r1.scan, 'suspect'); a.routeMark(sp.route, 'suspicious'); a.clue('c_scan', 'Component flagged', sp.r1.scanText); a.say('Component flagged', sp.r1.scanText, 'warn'); a.fx('scan', sp.r1.scan); } },
    { tool: 'lens', target: feed,
      requires: (s) => (!s.evidence.has(ev1.id) ? 'Retrieve the first piece of evidence in this room so the lens has something to follow.' : true),
      run: (a) => { a.flag('lensed'); a.clue('c_lens', 'Event order revealed', sp.lens.conclusion); a.dialog({ type: 'timeline', title: 'Forensic Lens: event order', steps: sp.lens.steps, conclusion: sp.lens.conclusion }); } },
    { tool: 'scanner', target: feed,
      run: (a) => {
        if (a.s.flags.fixed) { a.flag('verified'); a.routeMark(sp.route, 'restored'); a.status(feed, 'fixed'); a.say('Verified', 'The route is healthy: totals match and the fix is holding.', 'good'); a.fx('sparkle', feed); }
        else a.say('Route needs attention', 'The fault is still present. Choose a response first.', 'warn');
      } },
  ];
  const containment: Record<string, ContainmentCfg> = {
    [feed]: { availability: 3, narrow: 1, effective: true, notes: [{ label: 'Holds', text: 'Only this route pauses. Other routes keep running.', tone: 'good' }], onApply: (a) => { a.data.scope ??= 'narrow'; } },
  };
  const mission: MissionDef = {
    id: sp.id, title: sp.title, tagline: sp.tagline, status: 'playable', difficulty: sp.difficulty, startRoom: 'secure_ops',
    startClock: mins(sp.clock[0]), deadlineClock: mins(sp.clock[1]), deadlineLabel: sp.clock[2], parSeconds: sp.parSeconds,
    alert: { ...sp.alert, points: sp.pointsRoom }, briefing: sp.briefing,
    evidencePath: [sp.r1.room, sp.r2.room], evidence: [ev1, ev2], incidentRoute: sp.route, outline: sp.outline,
    passGrants: {
      [sp.r1.pass]: { when: (s: GameState) => !!s.flags.briefed, hint: 'Read the Incident Wall first: the alert points at the right room.' },
      [sp.r2.pass]: { when: (s: GameState) => s.evidence.has(ev1.id), hint: 'Nothing points there yet. Retrieve the first piece of evidence and read what it says.' },
    },
    rules, containment,
    interactions: {
      [propTarget('secure_ops', 'incident_wall')]: (a) => { a.flag('briefed'); a.dialog({ type: 'alert' }); },
      [sp.r1.evidenceProp]: (a) => { if (!a.evidence(ev1.id)) return; a.flag('ev1'); a.clue('c_ev1', ev1.name, sp.r1.evidenceBody); a.dialog({ type: 'info', title: `${ev1.name} (read-only)`, rows: sp.r1.evidenceRows, body: sp.r1.evidenceBody }); },
      [sp.r2.evidenceProp]: (a) => { if (!a.evidence(ev2.id)) return; a.flag('ev2'); a.clue('c_ev2', ev2.name, sp.r2.evidenceBody); a.dialog({ type: 'info', title: `${ev2.name} (read-only)`, rows: sp.r2.evidenceRows, body: sp.r2.evidenceBody }); },
      [sp.responseProp]: (a) => {
        if (!a.s.flags.ev1 || !a.s.flags.ev2) return a.say('Not enough evidence', 'Collect both pieces of evidence before choosing a response.', 'info', { hint: true });
        if (a.s.flags.fixed) return a.say('Already fixed', 'Verify the route with the Signal Scanner (1), then file the report.', 'info');
        a.dialog({
          type: 'choice', title: 'Choose a response', body: 'Pick the narrowest safe fix. A wrong choice is recoverable: you can try again.',
          options: sp.responses.map((r) => ({ id: r.id, label: r.label, detail: r.detail })),
          onChoose: (id) => {
            const r = sp.responses.find((x) => x.id === id)!;
            if (r.availabilityHit) a.hit('resp:' + id, r.availabilityHit, r.hitSeconds ?? 60);
            if (r.integrity) a.adjust('integrity', r.integrity, r.label);
            if (r.protection) a.adjust('protection', r.protection, r.label);
            a.data.scope = a.data.scope ?? (r.narrow >= 0.95 ? 'narrow' : 'broad');
            a.data.narrow = Math.max(a.data.narrow ?? 0, r.narrow);
            if (r.correct) { a.flag('fixed'); a.status(sp.responseProp, 'fixed'); a.fx('repair', sp.responseProp); a.data.mirrorStuck = false; a.data.silverLag = 0; a.data.bronzeLag = 0; a.say('Fixed', r.result, 'good'); }
            else { a.unnecessary(); a.say('That works against you', r.result, 'warn'); }
          },
        });
      },
    },
    objectives: [
      { id: 'o_brief', text: 'Read the Incident Wall', hint: 'Press E at the Incident Wall in Secure Ops Control.', done: (s) => !!s.flags.briefed },
      { id: 'o_p1', text: `Request the ${PASSES[sp.r1.pass].name}`, hint: 'Use the Access Desk or any door reader.', done: (s) => s.passes.has(sp.r1.pass) },
      { id: 'o_r1', text: `Walk to ${ROOM_BY_ID[sp.r1.room].name} (${ROOM_BY_ID[sp.r1.room].code})`, hint: 'Use the minimap (M) and click the room for a corridor guide.', done: (s) => !!s.flags['visited_' + sp.r1.room] },
      { id: 'o_scan', text: 'Scan the flagged component with the Signal Scanner (1)', hint: 'Select tool 1 and press E at the highlighted object.', done: (s) => !!s.flags.scanned },
      { id: 'o_e1', text: 'Retrieve the first evidence', hint: 'Press E at the terminal in the room.', done: (s) => !!s.flags.ev1 },
      { id: 'o_lens', text: 'Trace the event order with the Forensic Lens (2)', hint: 'Select tool 2 and click the incident route.', done: (s) => !!s.flags.lensed },
      { id: 'o_p2', text: `Request the ${PASSES[sp.r2.pass].name}`, hint: 'The evidence points at the next room.', done: (s) => s.passes.has(sp.r2.pass) },
      { id: 'o_e2', text: `Retrieve evidence in ${ROOM_BY_ID[sp.r2.room].name}`, hint: 'Walk there and press E at the highlighted terminal.', done: (s) => !!s.flags.ev2 },
      { id: 'o_resp', text: 'Choose the narrowest safe response', hint: 'Press E at the response console (see the inspect panel).', done: (s) => !!s.flags.fixed },
      { id: 'o_verify', text: 'Verify the route with the Signal Scanner (1)', hint: 'Click the incident route and press E with tool 1.', done: (s) => !!s.flags.verified },
      { id: 'o_report', text: 'File the report at the Evidence Board', hint: 'Return to Secure Ops Control.', done: (s) => !!s.flags.reported },
    ],
    canReport: (s) => (!s.flags.verified ? 'Verify the fix first.' : s.evidence.size < 2 ? 'Evidence is missing.' : true),
    isComplete: (s) => !!s.flags.reported,
    incidents: (s) => (s.flags.fixed ? 0 : 1),
    scoreInput: (s) => ({ diagnosed: !!s.flags.lensed, verified: !!s.flags.verified, reconciled: !!s.flags.fixed, narrow: s.data.narrow ?? 0.3, privacyOk: s.stats.unnecessary === 0 && s.stats.passDenials <= 1 }),
    debrief: (s) => ({ what: sp.debrief.what, response: [s.data.scope === 'narrow' ? 'You chose the narrowest safe response.' : 'You chose a broader response than needed: it worked, but it cost availability.', 'You requested read-only, masked passes only as evidence pointed to each room.', 'You verified the route before closing.'], learn: sp.debrief.learn }),
    setup: (a) => { if (sp.freshnessEffect === 'mirrorStuck') { a.data.mirrorStuck = true; a.data.bronzeLag = 4; } if (sp.freshnessEffect === 'silverLag') { a.data.silverLag = 40; } },
  };
  return mission;
}
export { propTarget };
