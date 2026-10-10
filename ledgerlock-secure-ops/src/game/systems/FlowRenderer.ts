import Phaser from 'phaser';
import { C, PALETTE } from '../constants';
import { toScreen } from './Grid';
import { ROUTES, STATE_LABEL, pointAt, polylineLength, routePoints } from '../../data/routes';
import type { Pt, RouteDef, RouteState } from '../types';

interface RouteGeo { def: RouteDef; grid: Pt[]; screen: Pt[]; len: number; label: Phaser.GameObjects.Text; mid: Pt }

const SCREEN = (pts: Pt[]): Pt[] => pts.map(([x, y]) => { const s = toScreen(x, y); return [s.x, s.y] as Pt; });

/** Draws the finance-route overlay: moving pulses, direction arrows, state styling. Never affects movement. */
export class FlowRenderer {
  readonly geo: RouteGeo[] = [];
  private g: Phaser.GameObjects.Graphics;
  visible = true;
  labelsVisible = true;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(20000);
    for (const def of ROUTES) {
      const grid = routePoints(def), screen = SCREEN(grid);
      // label on the longest segment
      let best = 0, mid: Pt = screen[0];
      for (let i = 1; i < screen.length; i++) {
        const l = Math.hypot(screen[i][0] - screen[i - 1][0], screen[i][1] - screen[i - 1][1]);
        if (l > best) { best = l; mid = [(screen[i][0] + screen[i - 1][0]) / 2, (screen[i][1] + screen[i - 1][1]) / 2]; }
      }
      const label = scene.add.text(mid[0], mid[1] - 6, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: PALETTE.white, backgroundColor: 'rgba(11,20,36,0.82)', padding: { x: 3, y: 1 },
      }).setOrigin(0.5, 1).setDepth(20001).setResolution(2);
      this.geo.push({ def, grid, screen, len: polylineLength(screen), label, mid });
    }
  }

  setVisible(v: boolean): void { this.visible = v; this.g.setVisible(v); this.geo.forEach((r) => r.label.setVisible(v && this.labelsVisible)); }

  /** Distance (px, world space) from a point to the route polyline. */
  hit(wx: number, wy: number): { id: string; d: number } | null {
    let best: { id: string; d: number } | null = null;
    for (const r of this.geo) {
      for (let i = 1; i < r.screen.length; i++) {
        const [ax, ay] = r.screen[i - 1], [bx, by] = r.screen[i];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / l2));
        const d = Math.hypot(wx - (ax + t * dx), wy - (ay + t * dy));
        if (!best || d < best.d) best = { id: r.def.id, d };
      }
    }
    return best;
  }

  /** Midpoint of a route in screen space. */
  routeMid(id: string): Pt { const r = this.geo.find((q) => q.def.id === id)!; const p = pointAt(r.screen, 0.5); return [p.x, p.y]; }

  draw(time: number, states: Record<string, RouteState>, selected: string | null, reduced: boolean, rerouted: Set<string>): void {
    const g = this.g;
    g.clear();
    if (!this.visible) return;
    for (const r of this.geo) {
      const st = states[r.def.id] ?? 'healthy';
      const sel = selected === 'route:' + r.def.id;
      const col = st === 'quarantined' ? C.coral : st === 'suspicious' ? C.amber : st === 'restored' ? C.mint : C[r.def.color];
      const dim = st === 'quarantined' ? 0.75 : st === 'delayed' ? 0.55 : 0.9;
      const w = sel ? 5 : 3;
      // underlay for contrast
      this.poly(g, r.screen, 0x0b1424, 0.65, w + 3);
      if (st === 'healthy' || st === 'restored') {
        if (r.def.dashed) this.dashed(g, r.screen, col, dim, w, 9, 6, reduced ? 0 : time * 0.02);
        else this.poly(g, r.screen, col, dim, w);
      } else if (st === 'delayed') this.dashed(g, r.screen, col, dim, w, 4, 7, reduced ? 0 : time * 0.006);
      else if (st === 'suspicious') this.dashed(g, r.screen, C.amber, 1, w + 1, 12, 5, reduced ? 0 : time * 0.03);
      else if (st === 'quarantined') this.dashed(g, r.screen, C.coral, 1, w, 3, 6, 0);
      else if (st === 'rerouted') this.dashed(g, r.screen, C.mint, 0.6, w, 5, 8, reduced ? 0 : time * 0.01);
      if (sel) this.poly(g, r.screen, 0xffffff, 0.35, 1.5);
      // direction arrows
      const n = Math.max(2, Math.round(r.len / 150));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n; this.arrow(g, r, t, col);
      }
      // pulses
      if (st !== 'quarantined') {
        const speed = (st === 'delayed' ? 0.3 : 1) * r.def.speed;
        const count = Math.max(2, Math.round(r.len / 220));
        for (let i = 0; i < count; i++) {
          const t = reduced ? (i + 0.5) / count : (((time / 1000) * speed + i / count) % 1);
          const p = pointAt(r.screen as Pt[], t);
          g.fillStyle(0xffffff, 0.95).fillCircle(p.x, p.y, 3.2);
          g.fillStyle(col, 0.6).fillCircle(p.x, p.y, 6);
        }
      } else {
        // barrier marks (shape + colour)
        const m = pointAt(r.screen as Pt[], 0.5);
        g.lineStyle(3, C.coral, 1).strokeRect(m.x - 7, m.y - 7, 14, 14);
        g.lineBetween(m.x - 7, m.y - 7, m.x + 7, m.y + 7);
        g.lineBetween(m.x - 7, m.y + 7, m.x + 7, m.y - 7);
      }
      if (st === 'rerouted' && rerouted.has(r.def.id)) {
        // highlight the Card Receipt route as the alternate path
        const alt = this.geo.find((q) => q.def.id === 'card_receipt');
        if (alt) this.poly(g, alt.screen, C.mint, 0.5, 7);
      }
    }
  }

  updateLabels(states: Record<string, RouteState>, selected: string | null): void {
    for (const r of this.geo) {
      const st = states[r.def.id] ?? 'healthy', L = STATE_LABEL[st];
      const txt = `${L.icon} ${r.def.name} → ${L.label}`;
      if (r.label.text !== txt) r.label.setText(txt);
      r.label.setColor(st === 'quarantined' ? PALETTE.coral : st === 'suspicious' ? PALETTE.amber : PALETTE.white);
      r.label.setVisible(this.visible && (this.labelsVisible || selected === 'route:' + r.def.id));
    }
  }

  private poly(g: Phaser.GameObjects.Graphics, pts: Pt[], col: number, a: number, w: number): void {
    g.lineStyle(w, col, a).beginPath().moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.strokePath();
  }
  private dashed(g: Phaser.GameObjects.Graphics, pts: Pt[], col: number, a: number, w: number, dash: number, gap: number, offset: number): void {
    g.lineStyle(w, col, a);
    let carry = -(offset % (dash + gap));
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const l = Math.hypot(bx - ax, by - ay); if (!l) continue;
      const ux = (bx - ax) / l, uy = (by - ay) / l;
      let d = carry;
      while (d < l) {
        const s = Math.max(0, d), e = Math.min(l, d + dash);
        if (e > s) g.lineBetween(ax + ux * s, ay + uy * s, ax + ux * e, ay + uy * e);
        d += dash + gap;
      }
      carry = d - l;
    }
  }
  private arrow(g: Phaser.GameObjects.Graphics, r: RouteGeo, t: number, col: number): void {
    const p = pointAt(r.screen as Pt[], t); const ang = Math.atan2(p.dy, p.dx), s = 7;
    const tip: Pt = [p.x + Math.cos(ang) * s, p.y + Math.sin(ang) * s];
    const l: Pt = [p.x + Math.cos(ang + 2.5) * s, p.y + Math.sin(ang + 2.5) * s], rr: Pt = [p.x + Math.cos(ang - 2.5) * s, p.y + Math.sin(ang - 2.5) * s];
    g.fillStyle(0x0b1424, 0.9).fillTriangle(tip[0], tip[1], l[0], l[1], rr[0], rr[1]);
    g.fillStyle(col, 1).fillTriangle(tip[0] - Math.cos(ang) * 1, tip[1] - Math.sin(ang) * 1, p.x + Math.cos(ang + 2.5) * (s - 2), p.y + Math.sin(ang + 2.5) * (s - 2), p.x + Math.cos(ang - 2.5) * (s - 2), p.y + Math.sin(ang - 2.5) * (s - 2));
  }
}
