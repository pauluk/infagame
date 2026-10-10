import { Emitter } from '../../game/systems/Emitter';
import type { GameState } from '../../game/systems/GameState';
import { settings } from '../../game/systems/Settings';

/** JEV (TypeSafe AI) second opinions. The browser only ever talks to our own /api/jev: the key lives on the server. */
export interface JevOption { id: string; label: string; detail: string }
export interface JevChoice { choice: string; confidence: number; probabilities: Record<string, number> }
export type JevStatus = 'unknown' | 'checking' | 'ready' | 'not_configured' | 'unavailable';

/** A plain-text summary of the incident so far: only synthetic clues and evidence names, never real data. */
export function jevContext(s: GameState): string {
  const m = s.mission, lines: string[] = [];
  lines.push(`Incident: ${m.alert.headline}`, `Symptoms: ${m.alert.symptoms.join('; ')}`);
  const clues = [...s.clues.values()].map((c) => `- ${c.label}: ${c.text}`);
  lines.push(clues.length ? 'Clues found:\n' + clues.join('\n') : 'Clues found: none yet');
  const ev = m.evidence.filter((e) => s.evidence.has(e.id)).map((e) => e.name);
  lines.push(`Evidence collected: ${ev.length ? ev.join(', ') : 'none yet'}`);
  const contained = Object.keys(s.contained);
  lines.push(`Contained now: ${contained.length ? contained.join(', ') : 'nothing'}`);
  const fixes = Object.keys(s.flags).filter((f) => s.flags[f] && /^(patched|purged|reconciled|released|diagnosed|restored|rotated)/.test(f));
  if (fixes.length) lines.push(`Done: ${fixes.join(', ')}`);
  return lines.join('\n').slice(0, 3800);
}

class JevClient extends Emitter<{ change: JevStatus }> {
  status: JevStatus = 'unknown';
  calls = 0;
  private pending: Promise<void> | null = null;

  get enabled(): boolean { return settings.data.jev && this.status === 'ready'; }

  /** Asks our own server whether a key is configured. Never returns or exposes the key. */
  check(): Promise<void> {
    if (this.pending) return this.pending;
    this.set('checking');
    this.pending = (async () => {
      try {
        const r = await fetch('./api/jev', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        this.set(j.configured ? 'ready' : 'not_configured');
      } catch { this.set('unavailable'); }
      finally { this.pending = null; }
    })();
    return this.pending;
  }
  private set(s: JevStatus): void { if (s !== this.status) { this.status = s; this.emit('change', s); } }

  private async post<T>(body: object): Promise<T | null> {
    if (!this.enabled) return null;
    this.calls++;
    try {
      const r = await fetch('./api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { if (r.status === 503) this.set('not_configured'); return null; }
      return (await r.json()) as T;
    } catch { return null; }
  }

  /** Which option does JEV think is best, and how sure is it? null when JEV is off or unreachable. */
  async decide(s: GameState, title: string, body: string, options: JevOption[]): Promise<JevChoice | null> {
    const j = await this.post<Partial<JevChoice>>({ kind: 'decision', title, body, options, context: jevContext(s) });
    if (!j || typeof j.choice !== 'string' || !options.some((o) => o.id === j.choice) || typeof j.confidence !== 'number') return null;
    s.stats.jevCalls++;
    return { choice: j.choice, confidence: j.confidence, probabilities: j.probabilities ?? {} };
  }

  /** Probability (0..1) that the evidence supports a statement. */
  async supports(s: GameState, claim: string): Promise<number | null> {
    const j = await this.post<{ supported?: number }>({ kind: 'supports', claim, context: jevContext(s) });
    if (!j || typeof j.supported !== 'number') return null;
    s.stats.jevCalls++;
    return j.supported;
  }
}
export const jev = new JevClient();
