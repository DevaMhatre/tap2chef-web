import { useState } from "react";
import { MdAdd } from "react-icons/md";
import type { CategoryId, ItemId } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { DietMark } from "../../design-system/DietMark";
import { ListNote, ListRow, ListSection } from "../../design-system/GroupedList";
import { compactPrices, priceSummary } from "./display";

// Below this the whole menu fits a screen and opens expanded; from here it
// opens as an overview, "Mains · 12", one tap per category.
const COLLAPSED_FROM = 4;

type Props = {
  menu: ReadyMenuBuilder;
  onEditItem: (id: ItemId) => void;
  onEditCategory: (id: CategoryId) => void;
  onAddCategory: () => void;
};

const sectionId = (key: string) => `menu-section-${key}`;

type Contents = { signature: string; dishes: Map<string, Set<string>> };

// What each category holds, so a change can be noticed: "Mains" gained a dish.
const contentsOf = (sections: { key: string; ids: string[] }[]): Contents => ({
  signature: sections.map((s) => `${s.key}:${s.ids.join(",")}`).join("|"),
  dishes: new Map(sections.map((s) => [s.key, new Set(s.ids)])),
});

export function MenuList({ menu, onEditItem, onEditCategory, onAddCategory }: Props) {
  const sections = menu.sections.map((section) => ({
    section,
    key: section.kind === "category" ? section.category.id : "uncategorized",
    title: section.kind === "category" ? section.category.name : "Uncategorized",
    ids: section.items.map((i) => i.id as string),
  }));

  // Visual-only state: which categories are open.
  const [open, setOpen] = useState<Set<string>>(() =>
    sections.length < COLLAPSED_FROM ? new Set(sections.map((s) => s.key)) : new Set(),
  );
  // A dish just added, or a new category, must never land out of sight: the
  // category that changed opens. Compared while rendering, not in an effect,
  // so it opens in the same frame the dish appears.
  const [seen, setSeen] = useState(() => contentsOf(sections));
  const now = contentsOf(sections);
  if (now.signature !== seen.signature) {
    const changed = sections
      .filter(({ key, ids }) => {
        const before = seen.dishes.get(key);
        return before === undefined || ids.some((id) => !before.has(id));
      })
      .map((s) => s.key);
    setSeen(now);
    if (changed.length > 0) setOpen((current) => new Set([...current, ...changed]));
  }
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {sections.map(({ section, key, title }) => (
        <ListSection
          key={key}
          id={sectionId(key)}
          disclosure={{ open: open.has(key), onToggle: () => toggle(key) }}
          header={
            <>
              {title} <span className="font-normal text-muted tabular-nums">· {section.items.length}</span>
            </>
          }
          headerAction={
            section.kind === "category" && (
              <Button
                variant="plain"
                size="compact"
                className="-mr-3"
                aria-label={`Edit ${title}`}
                onClick={() => onEditCategory(section.category.id)}
              >
                Edit
              </Button>
            )
          }
        >
          {section.items.length === 0 ? (
            <ListNote>No items yet</ListNote>
          ) : (
            section.items.map((item) => {
              // Phones: price on the right, differences on a second line.
              // Wider screens: everything named on one line.
              const compact = compactPrices(item, menu.profiles);
              return (
                <ListRow
                  key={item.id}
                  leading={<DietMark diet={item.diet} />}
                  detail={compact.detail && <span className="md:hidden">{compact.detail}</span>}
                  trailing={
                    <span className="max-w-[60%] shrink-0 truncate text-[15px] text-muted tabular-nums">
                      <span className="md:hidden">{compact.main}</span>
                      <span className="hidden md:inline">{priceSummary(item, menu.profiles, { named: true })}</span>
                    </span>
                  }
                  onClick={() => onEditItem(item.id)}
                >
                  {item.name}
                </ListRow>
              );
            })
          )}
        </ListSection>
      ))}

      <Button variant="secondary" className="w-full" onClick={onAddCategory}>
        <MdAdd className="text-xl" /> Add Category
      </Button>
    </div>
  );
}
