/** Materialize a declaration only when a collector asks for its value. */
export class DeferredMap<K, V> extends Map<K, V> {
  private readonly pending = new Map<K, () => void>();
  private readonly loading = new Set<K>();

  defer(key: K, load: () => void): void {
    if (this.has(key)) return;
    this.pending.set(key, load);
  }

  override clear(): void {
    this.pending.clear();
    this.loading.clear();
    super.clear();
  }

  override get(key: K): V | undefined {
    const load = this.pending.get(key);
    if (load && !this.loading.has(key)) {
      this.loading.add(key);
      try {
        load();
        this.pending.delete(key);
      } finally {
        this.loading.delete(key);
      }
    }
    return super.get(key);
  }
}
