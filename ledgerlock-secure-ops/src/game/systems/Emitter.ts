export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(p: never) => void>>();
  on<K extends keyof Events>(evt: K, fn: (payload: Events[K]) => void): () => void {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt)!.add(fn as (p: never) => void);
    return () => this.handlers.get(evt)?.delete(fn as (p: never) => void);
  }
  emit<K extends keyof Events>(evt: K, payload: Events[K]): void {
    this.handlers.get(evt)?.forEach((fn) => (fn as (p: Events[K]) => void)(payload));
  }
}
