import type { FabricContext, FabricDataProvider, FabricSnapshot, FabricStage } from './FabricDataProvider';

/** Offline, synthetic Fabric data. Always works. Never presented as live. */
export class DemoFabricAdapter implements FabricDataProvider {
  readonly id = 'demo' as const;
  readonly label = 'Demo data';
  async isAvailable(): Promise<boolean> { return true; }

  async getSnapshot(ctx: FabricContext): Promise<FabricSnapshot> {
    const base = 1240 + Math.round(ctx.elapsedMin * 11);
    const lagPerStage = ctx.mirrorPaused ? 6 + ctx.elapsedMin * 0.6 : 0;
    const dup = ctx.duplicatesInBronze;
    const mk = (id: FabricStage['id'], name: string, lag: number, count: number): FabricStage => ({
      id, name, eventCount: count, freshnessMin: Math.round((1.2 + lag + (ctx.extraLag?.[id] ?? 0) + (id === 'bronze' ? 0 : id === 'silver' ? 1.4 : 2.6)) * 10) / 10,
      status: ctx.mirrorPaused || (ctx.extraLag?.[id] ?? 0) > 5 ? 'delayed' : 'healthy', lastRun: new Date(Date.UTC(2026, 9, 10, 15, 0)).toISOString(), note: id === 'bronze' && dup ? `${dup} replayed event(s) landed in Bronze` : undefined,
    });
    const stages = [mk('bronze', 'Bronze (raw events)', lagPerStage, base + dup), mk('silver', 'Silver (cleaned)', lagPerStage, base), mk('gold', 'Gold (reporting)', lagPerStage, base)];
    const worst = Math.max(...stages.map((s) => s.freshnessMin ?? 0));
    const dashStatus = ctx.mirrorPaused || worst > 8 ? 'stale' : dup && !ctx.verified ? 'attention' : 'healthy';
    return {
      mode: 'demo', label: this.label, asOf: new Date().toISOString(), stages, freshnessMin: worst, processedEvents: base,
      duplicatesInBronze: dup,
      dashboard: {
        name: 'Finance Receipts (demo dashboard)', status: dashStatus, lastRefresh: new Date(Date.UTC(2026, 9, 10, 15, 0)).toISOString(),
        note: dashStatus === 'healthy' ? 'Receipt counts match the ledger.' : dashStatus === 'stale' ? 'Mirror paused: numbers are catching up.' : 'Receipt count is one higher than the ledger (replayed event).',
      },
      notes: ['Synthetic sample data generated locally. Not connected to Microsoft Fabric.'],
    };
  }
}
