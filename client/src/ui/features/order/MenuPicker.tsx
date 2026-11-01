import { useState } from "react";
import { MdSearch } from "react-icons/md";
import type { DishRow, ReadyOrder } from "../../../usecases/useOrder";
import { DietMark } from "../../design-system/DietMark";
import { ListNote, ListSection } from "../../design-system/GroupedList";
import { formatPrice } from "../../format";

// Below this, jump chips are noise.
const CHIPS_FROM = 4;
const sectionId = (key: string) => `order-section-${key}`;

type Props = {
  screen: ReadyOrder;
  onAdd: (dish: DishRow, portion?: string) => void;
  /** Sits beside the search field, e.g. the Out Today button. */
  accessory?: React.ReactNode;
  /** Sits under the search field, e.g. the price-list choice. */
  children?: React.ReactNode;
};

// The whole menu, one tap per dish. Search finds a dish by any word or its
// initials; Return adds the first match on a keyboard.
export function MenuPicker({ screen, onAdd, accessory, children }: Props) {
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  const results = searching ? screen.search(query) : [];
  const sections = screen.sections.map((section) => ({
    section,
    key: section.kind === "category" ? section.category.id : "uncategorized",
    title: section.kind === "category" ? section.category.name : "Uncategorized",
  }));

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search dishes</span>
            <MdSearch aria-hidden className="pointer-events-none absolute inset-y-0 left-3 my-auto text-xl text-muted" />
            <input
              type="search"
              enterKeyHint="go"
              autoComplete="off"
              placeholder="Search dishes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // A half / full dish waits for its portion: Return never guesses.
                const first = results.find((d) => !d.out);
                if (e.key === "Enter" && first && first.choices.length === 1) {
                  e.preventDefault();
                  onAdd(first);
                  setQuery("");
                }
                if (e.key === "Escape") setQuery("");
              }}
              className="min-h-11 w-full rounded-xl bg-surface pr-3 pl-10 text-[17px] text-ink outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-ink/20"
            />
          </label>
          {accessory}
        </div>
        {children}
        {!searching && sections.length >= CHIPS_FROM && (
          <nav aria-label="Jump to category" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
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
      </div>

      {searching ? (
        <ListSection header="Results">
          {results.length === 0 ? (
            <ListNote>No dish matches &ldquo;{query.trim()}&rdquo;</ListNote>
          ) : (
            results.map((dish) => <DishButton key={dish.item.id} dish={dish} onAdd={onAdd} />)
          )}
        </ListSection>
      ) : (
        sections.map(({ section, key, title }) => (
          <ListSection key={key} id={sectionId(key)} header={title}>
            {section.items.map((dish) => (
              <DishButton key={dish.item.id} dish={dish} onAdd={onAdd} />
            ))}
          </ListSection>
        ))
      )}
    </div>
  );
}

function DishButton({ dish, onAdd }: { dish: DishRow; onAdd: (dish: DishRow, portion?: string) => void }) {
  if (dish.choices.length > 1) return <PortionRow dish={dish} onAdd={onAdd} />;
  return (
    <button
      type="button"
      disabled={dish.out}
      aria-label={`${dish.item.name}, ${dish.out ? "out today" : formatPrice(dish.choices[0]!.price)}${dish.inCart > 0 ? `, ${dish.inCart} in order` : ""}`}
      onClick={() => onAdd(dish)}
      className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left text-[17px] transition-colors active:bg-surface-2 disabled:active:bg-transparent"
    >
      <span className={`flex min-w-0 flex-1 items-center gap-3 ${dish.out ? "opacity-45" : ""}`}>
        <DietMark diet={dish.item.diet} decorative />
        <span className="truncate">{dish.item.name}</span>
      </span>
      {dish.inCart > 0 && (
        <span
          key={dish.inCart}
          aria-hidden
          className="flex h-6 min-w-6 shrink-0 animate-[pop_240ms_cubic-bezier(0.32,0.72,0,1)] items-center justify-center rounded-full bg-primary px-1.5 text-[13px] font-bold text-white tabular-nums"
        >
          {dish.inCart}
        </span>
      )}
      <span className={`shrink-0 text-[15px] tabular-nums ${dish.out ? "font-semibold text-primary" : "text-muted"}`}>
        {dish.out ? "Out today" : formatPrice(dish.choices[0]!.price)}
      </span>
    </button>
  );
}

// Half and full side by side: one tap adds the portion, and both prices are
// in view, so nobody opens a menu to find out what a half costs.
function PortionRow({ dish, onAdd }: { dish: DishRow; onAdd: (dish: DishRow, portion?: string) => void }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <span className={`flex min-w-0 flex-1 items-center gap-3 text-[17px] ${dish.out ? "opacity-45" : ""}`}>
        <DietMark diet={dish.item.diet} decorative />
        <span className="truncate">{dish.item.name}</span>
        {dish.out && <span className="ml-auto shrink-0 text-[15px] font-semibold text-primary sm:hidden">Out today</span>}
      </span>
      {dish.out ? (
        <span className="hidden shrink-0 text-[15px] font-semibold text-primary sm:inline">Out today</span>
      ) : (
        <span className="flex shrink-0 gap-2 pl-7 sm:pl-0">
          {dish.choices.map((choice) => (
            <button
              key={choice.portion}
              type="button"
              aria-label={`${dish.item.name}, ${choice.portion} ${formatPrice(choice.price)}${choice.inCart > 0 ? `, ${choice.inCart} in order` : ""}`}
              onClick={() => onAdd(dish, choice.portion)}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-[15px] transition-colors active:bg-line sm:flex-none"
            >
              {choice.inCart > 0 && (
                <span
                  key={choice.inCart}
                  aria-hidden
                  className="flex h-6 min-w-6 animate-[pop_240ms_cubic-bezier(0.32,0.72,0,1)] items-center justify-center rounded-full bg-primary px-1.5 text-[13px] font-bold text-white tabular-nums"
                >
                  {choice.inCart}
                </span>
              )}
              <span className="font-semibold">{choice.portion}</span>
              <span className="text-muted tabular-nums">{formatPrice(choice.price)}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
