import { Emitter } from './Emitter';

export interface SettingsData { muted: boolean; reducedMotion: boolean; relaxed: boolean; touch: 'auto' | 'on' | 'off'; largeText: boolean; tutorial: boolean }
const KEY = 'ledgerlock.settings.v1';

function load(): SettingsData {
  const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base: SettingsData = { muted: false, reducedMotion: prefersReduced, relaxed: false, touch: 'auto', largeText: false, tutorial: false };
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...base, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
  return base;
}

class SettingsStore extends Emitter<{ change: SettingsData }> {
  data: SettingsData = load();
  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]): void {
    this.data = { ...this.data, [k]: v };
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    this.emit('change', this.data);
  }
}
export const settings = new SettingsStore();
