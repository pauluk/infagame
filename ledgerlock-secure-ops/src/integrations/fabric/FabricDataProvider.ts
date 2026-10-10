/** Normalised, read-only Fabric status model used by the game UI. */
export type StageId = 'bronze' | 'silver' | 'gold';
export type StageStatus = 'healthy' | 'delayed' | 'stale' | 'paused' | 'unknown';

export interface FabricStage {
  id: StageId; name: string; status: StageStatus;
  eventCount: number | null;           // null when the provider cannot supply it (e.g. live pipeline metadata only)
  freshnessMin: number | null;
  lastRun: string | null;              // ISO time or null
  note?: string;
}
export interface FabricSnapshot {
  mode: 'demo' | 'connected';
  label: string;                       // text shown in the UI badge: "Demo data" or "Connected"
  asOf: string;
  stages: FabricStage[];
  freshnessMin: number;                // worst stage freshness
  dashboard: { name: string; status: 'healthy' | 'stale' | 'attention' | 'unknown'; lastRefresh: string | null; note: string };
  processedEvents: number | null;
  duplicatesInBronze: number | null;
  notes: string[];
}

/** What the simulation tells the demo adapter (ignored by the live adapter). */
export interface FabricContext {
  elapsedMin: number;
  mirrorPaused: boolean;               // event mirror route / event stream / fabric contained
  duplicatesInBronze: number;
  verified: boolean;
  /** Extra scenario lag in minutes (e.g. a stalled Silver refresh). */
  extraLag?: { bronze?: number; silver?: number; gold?: number };
}

export interface FabricDataProvider {
  readonly id: 'demo' | 'live';
  readonly label: string;
  /** Supported, read-only status request. Never throws: returns a snapshot with `mode` and notes describing problems. */
  getSnapshot(ctx: FabricContext): Promise<FabricSnapshot>;
  /** Whether the provider is usable right now (live: configured and reachable). */
  isAvailable(): Promise<boolean>;
}
