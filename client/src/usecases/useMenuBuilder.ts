import { useEffect, useMemo, useState } from "react";
import { groupByCategory, type MenuItem, type MenuProfile, type MenuSection } from "../domain/menu";
import { sortByOrder } from "../domain/ordering";
import { createMenuEditor, type MenuCommands } from "./menuEditor";
import type { MenuSnapshot } from "./ports";
import { usePorts } from "./PortsProvider";

export type { Undo } from "./menuEditor";

export type MenuBuilder =
  | { state: "loading" }
  | { state: "empty"; createMenu(): Promise<void> }
  | ({ state: "ready"; profiles: MenuProfile[]; sections: MenuSection<MenuItem>[] } & Omit<
      MenuCommands,
      "createMenu"
    >);

export type ReadyMenuBuilder = Extract<MenuBuilder, { state: "ready" }>;

export function useMenuBuilder(): MenuBuilder {
  const { menu, ids } = usePorts();
  const editor = useMemo(() => createMenuEditor(menu, ids), [menu, ids]);
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);

  useEffect(() => editor.subscribe(setSnapshot), [editor]);

  if (!snapshot) return { state: "loading" };
  const { createMenu, ...commands } = editor.commands;
  if (snapshot.profiles.length === 0) return { state: "empty", createMenu };
  return {
    state: "ready",
    profiles: sortByOrder(snapshot.profiles),
    sections: groupByCategory(snapshot.categories, snapshot.items),
    ...commands,
  };
}
