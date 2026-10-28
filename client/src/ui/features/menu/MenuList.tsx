import { MdAdd } from "react-icons/md";
import type { CategoryId, ItemId } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { DietMark } from "../../design-system/DietMark";
import { ListNote, ListRow, ListSection } from "../../design-system/GroupedList";
import { compactPrices, priceSummary } from "./display";

// Below this, jump chips are noise; above it, scrolling to Desserts is a chore.
const CHIPS_FROM = 4;

type Props = {
  menu: ReadyMenuBuilder;
  onEditItem: (id: ItemId) => void;
  onEditCategory: (id: CategoryId) => void;
  onAddCategory: () => void;
};

const sectionId = (key: string) => `menu-section-${key}`;

export function MenuList({ menu, onEditItem, onEditCategory, onAddCategory }: Props) {
  const sections = menu.sections.map((section) => ({
    section,
    key: section.kind === "category" ? section.category.id : "uncategorized",
    title: section.kind === "category" ? section.category.name : "Uncategorized",
  }));

  return (
    <div className="space-y-6">
      {sections.length >= CHIPS_FROM && (
        <nav aria-label="Jump to category" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-6 md:px-6">
          {sections.map(({ key, title }) => (
            <button
              key={key}
              type="button"
              onClick={() => document.getElementById(sectionId(key))?.scrollIntoView({ behavior: "smooth" })}
              className="min-h-11 shrink-0 rounded-full bg-surface px-4 text-[15px] font-semibold transition-colors active:bg-surface-2"
            >
              {title}
            </button>
          ))}
        </nav>
      )}

      {sections.map(({ section, key, title }) => (
        <ListSection
          key={key}
          id={sectionId(key)}
          header={`${title} · ${section.items.length}`}
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
