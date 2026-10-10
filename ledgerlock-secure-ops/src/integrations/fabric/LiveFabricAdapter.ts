import type { FabricContext, FabricDataProvider, FabricSnapshot } from './FabricDataProvider';

/**
 * Optional, DISABLED-BY-DEFAULT adapter for a future, separately approved connection.
 * It never talks to Microsoft Fabric directly and never sees credentials: it only calls the local server-side proxy
 * (server/fabricProxy.mjs), which holds the secrets and makes read-only calls to the documented Fabric REST API
 * "Job Scheduler - List Item Job Instances" (GET /v1/workspaces/{workspaceId}/items/{itemId}/jobs/instances).
 * If anything is missing or fails, callers fall back to the demo adapter and the UI keeps saying "Demo data".
 */
export class LiveFabricAdapter implements FabricDataProvider {
  readonly id = 'live' as const;
  readonly label = 'Connected';
  constructor(private readonly baseUrl = '/api/fabric') {}

  async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/health`, { cache: 'no-store' });
      if (!r.ok) return false;
      const j = (await r.json()) as { enabled?: boolean; configured?: boolean };
      return j.enabled === true && j.configured === true;
    } catch { return false; }
  }

  async getSnapshot(_ctx: FabricContext): Promise<FabricSnapshot> {
    const r = await fetch(`${this.baseUrl}/snapshot`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Fabric proxy returned ${r.status}`);
    const j = (await r.json()) as FabricSnapshot;
    return { ...j, mode: 'connected', label: this.label };
  }
}
