export type RecordChange = { op: "put" | "remove"; table: string; record: { id: string } };

// What a snapshot looks like once `changes` land. Lets the next command plan
// against fresh data without waiting for the repository to emit.
export function applyChanges<S extends object>(snapshot: S, changes: readonly RecordChange[]): S {
  const next = { ...snapshot } as Record<string, { id: string }[]>;
  const copied = new Set<string>();
  for (const change of changes) {
    if (!copied.has(change.table)) {
      next[change.table] = [...next[change.table]!];
      copied.add(change.table);
    }
    const list = next[change.table]!;
    const index = list.findIndex((r) => r.id === change.record.id);
    if (change.op === "remove") {
      if (index >= 0) list.splice(index, 1);
    } else if (index >= 0) {
      list[index] = change.record;
    } else {
      list.push(change.record);
    }
  }
  return next as S;
}
