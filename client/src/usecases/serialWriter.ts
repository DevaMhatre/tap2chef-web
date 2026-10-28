export type Plan<C, T> = { changes: C[]; result: T };

/**
 * One write at a time, each planned against the result of the one before, so
 * fast taps never plan two changes from the same stale snapshot. A repeated
 * keyed command (double tap) gets the pending promise instead of running twice.
 */
export function createSerialWriter<S, C>(
  write: (changes: readonly C[]) => Promise<void>,
  apply: (snapshot: S, changes: readonly C[]) => S,
) {
  // What commands plan against: the repository's view plus any writes it
  // hasn't emitted yet.
  let latest: S | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    observe(snapshot: S) {
      latest = snapshot;
    },
    current: (): S | null => latest,
    /** `key` null: every call runs (each tap on a dish adds one more). */
    run<T>(key: string | null, plan: (snapshot: S) => Plan<C, T>): Promise<T> {
      const pending = key === null ? undefined : inFlight.get(key);
      if (pending) return pending as Promise<T>;

      const task = queue.then(async () => {
        if (!latest) throw new Error("Not loaded yet");
        const { changes, result } = plan(latest);
        if (changes.length > 0) {
          await write(changes);
          latest = apply(latest, changes);
        }
        return result;
      });
      const settled = key === null ? task : task.finally(() => inFlight.delete(key));
      if (key !== null) inFlight.set(key, settled);
      queue = settled.catch(() => undefined);
      return settled;
    },
  };
}
