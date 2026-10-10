import { DemoFabricAdapter } from './DemoFabricAdapter';
import { LiveFabricAdapter } from './LiveFabricAdapter';
import type { FabricContext, FabricDataProvider, FabricSnapshot } from './FabricDataProvider';

export * from './FabricDataProvider';

/** Demo is the default. Live is used only when VITE_FABRIC_MODE=live AND the server proxy reports it is enabled and configured. */
export class FabricService {
  private demo = new DemoFabricAdapter();
  private live = new LiveFabricAdapter();
  private useLive = false;
  private checked = false;
  get providerLabel(): string { return this.useLive ? this.live.label : this.demo.label; }

  async snapshot(ctx: FabricContext): Promise<FabricSnapshot> {
    if (!this.checked) {
      this.checked = true;
      if ((import.meta.env?.VITE_FABRIC_MODE ?? 'demo') === 'live') this.useLive = await this.live.isAvailable();
    }
    if (this.useLive) {
      try { return await this.live.getSnapshot(ctx); } catch { this.useLive = false; }
    }
    return this.demo.getSnapshot(ctx);
  }
}
export type { FabricDataProvider };
