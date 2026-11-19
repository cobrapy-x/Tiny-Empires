/** Minimal typed event emitter. */
export class Emitter<E extends object> {
  private handlers = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, fn: (payload: E[K]) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn as (payload: never) => void);
    return () => this.handlers.get(event)?.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((fn) => (fn as (p: E[K]) => void)(payload));
  }
}
