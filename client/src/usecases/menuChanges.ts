import type { MenuChange, MenuSnapshot } from "./ports";

// What the menu looks like once `changes` land. Lets the next command plan
// against fresh data without waiting for the repository to emit.
export function applyChanges(menu: MenuSnapshot, changes: readonly MenuChange[]): MenuSnapshot {
  const next: MenuSnapshot = {
    ...menu,
    profiles: [...menu.profiles],
    categories: [...menu.categories],
    items: [...menu.items],
  };
  for (const change of changes) {
    const list = next[change.table] as { id: string }[];
    const index = list.findIndex((r) => r.id === change.record.id);
    if (change.op === "remove") {
      if (index >= 0) list.splice(index, 1);
    } else if (index >= 0) {
      list[index] = change.record;
    } else {
      list.push(change.record);
    }
  }
  return next;
}
