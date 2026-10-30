import { useRef, useState, type KeyboardEvent } from "react";
import type { IconType } from "react-icons";
import { MdAdd, MdCake, MdFastfood, MdLocalCafe, MdRestaurantMenu, MdRiceBowl, MdSoupKitchen } from "react-icons/md";
import { NAME_MAX } from "../../../domain/menu";
import type { DishRow, DishRowError } from "../../../domain/setup";
import type { StarterMenu } from "../../../domain/starterMenus";
import type { Setup } from "../../../usecases/useSetup";
import { Button } from "../../design-system/Button";
import { DietMark } from "../../design-system/DietMark";
import { FieldError, TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { nameMessage, priceMessage } from "../menu/display";
import { DIET_OPTIONS } from "../menu/QuickAddSheet";
import { Screen } from "./SetupFlow";

type MenuStep = Extract<Setup, { step: "menu" }>;

const ICONS: Record<string, IconType> = {
  biryani: MdRiceBowl,
  southIndian: MdSoupKitchen,
  cafe: MdLocalCafe,
  fastFood: MdFastfood,
  sweets: MdCake,
};

/** "Something else": no list to pick from, a first dish of their own to type. */
const OWN_MENU: StarterMenu = { id: "own", label: "Your dishes", sections: [{ category: "Dishes", dishes: [] }] };

let ownKeys = 0;
const ownRow = (category: string): DishRow => ({ kind: "own", key: `own-${++ownKeys}`, category, name: "", diet: null, price: "" });

function rowsOf(menu: StarterMenu): DishRow[] {
  const starters = menu.sections.flatMap(({ category, dishes }) =>
    dishes.map((d): DishRow => ({ kind: "starter", key: `${category}/${d.name}`, category, name: d.name, diet: d.diet, price: "" })),
  );
  return menu === OWN_MENU ? [ownRow("Dishes")] : starters;
}

/** A dish counts once it has a price, or (their own) a name. */
const picked = (row: DishRow) => row.price.trim() !== "" || (row.kind === "own" && row.name.trim() !== "");

// What do you sell? A kind of restaurant leads to a list to price; typing a
// price is what picks a dish, so there is nothing to tick.
export function StarterList({ setup }: { setup: MenuStep }) {
  const [menu, setMenu] = useState<StarterMenu>();
  if (!menu) return <Kinds setup={setup} onChoose={setMenu} />;
  return <PriceList key={menu.id} setup={setup} menu={menu} onBack={() => setMenu(undefined)} />;
}

function Kinds({ setup, onChoose }: { setup: MenuStep; onChoose: (menu: StarterMenu) => void }) {
  const kinds = [...setup.starters, OWN_MENU];
  return (
    <Screen back={() => void setup.back()} title="What do you sell?" subtitle="Pick the closest. You’ll choose your dishes next.">
      <div className="grid grid-cols-2 gap-3">
        {kinds.map((kind) => {
          const Icon = ICONS[kind.id] ?? MdRestaurantMenu;
          return (
            <button
              key={kind.id}
              type="button"
              onClick={() => onChoose(kind)}
              className="flex min-h-28 flex-col items-start justify-between rounded-2xl bg-surface p-4 text-left transition-transform active:scale-[0.97]"
            >
              <Icon aria-hidden className="text-3xl text-primary" />
              <span className="text-[17px] leading-snug font-semibold">{kind === OWN_MENU ? "Something else" : kind.label}</span>
            </button>
          );
        })}
      </div>
      <Button variant="plain" className="mt-6 w-full" onClick={() => void setup.later()}>
        I&rsquo;ll add dishes later
      </Button>
    </Screen>
  );
}

function PriceList({ setup, menu, onBack }: { setup: MenuStep; menu: StarterMenu; onBack: () => void }) {
  const [rows, setRows] = useState<DishRow[]>(() => rowsOf(menu));
  const [errors, setErrors] = useState<Record<string, DishRowError>>({});
  const [focusKey, setFocusKey] = useState<string>();
  const list = useRef<HTMLDivElement>(null);
  const count = rows.filter(picked).length;

  const change = (key: string, patch: Partial<Pick<DishRow, "name" | "price">> & { diet?: DishRow["diet"] }) => {
    setRows((all) => all.map((r) => (r.key === key ? ({ ...r, ...patch } as DishRow) : r)));
    setErrors((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
  };

  const addOwn = (category: string) => {
    const row = ownRow(category);
    setRows((all) => {
      const last = all.findLastIndex((r) => r.category === category);
      return [...all.slice(0, last + 1), row, ...all.slice(last + 1)];
    });
    setFocusKey(row.key);
  };

  // Return moves to the next price, as on a printed menu read top to bottom.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    const fields = [...(list.current?.querySelectorAll<HTMLInputElement>("input") ?? [])];
    fields[fields.indexOf(event.target) + 1]?.focus();
  };

  async function add() {
    const result = await setup.addDishes(rows);
    if (result.ok) return;
    setErrors(result.error);
    const first = rows.find((r) => result.error[r.key]);
    list.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(first?.key ?? "")}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const sections = [...new Set(rows.map((r) => r.category))];
  return (
    <Screen
      back={onBack}
      title={menu.label}
      subtitle="Type the price of each dish you sell. Leave the rest empty."
      footer={
        <>
          <Button className="w-full tabular-nums" disabled={count === 0} onClick={() => void add()}>
            {count === 0 ? "Add Dishes" : `Add ${count} ${count === 1 ? "Dish" : "Dishes"}`}
          </Button>
          <Button variant="plain" className="mt-1 w-full" onClick={() => void setup.later()}>
            I&rsquo;ll add dishes later
          </Button>
        </>
      }
    >
      <div ref={list} onKeyDown={onKeyDown} className="space-y-6">
        {sections.map((category) => (
          <ListSection key={category} header={category}>
            {rows
              .filter((r) => r.category === category)
              .map((row) =>
                row.kind === "starter" ? (
                  <StarterRow key={row.key} row={row} error={errors[row.key]} onPrice={(price) => change(row.key, { price })} />
                ) : (
                  <OwnRow key={row.key} row={row} error={errors[row.key]} autoFocus={focusKey === row.key} onChange={(patch) => change(row.key, patch)} />
                ),
              )}
            <button
              type="button"
              onClick={() => addOwn(category)}
              className="flex min-h-12 w-full items-center gap-2 px-4 text-[17px] font-semibold text-primary transition-colors active:bg-surface-2"
            >
              <MdAdd aria-hidden className="text-xl" />
              Add a Dish
            </button>
          </ListSection>
        ))}
        <p className="px-4 text-[13px] text-muted">Change any dish or price later in Menu.</p>
      </div>
    </Screen>
  );
}

function StarterRow({ row, error, onPrice }: { row: Extract<DishRow, { kind: "starter" }>; error?: DishRowError; onPrice: (price: string) => void }) {
  return (
    <div data-row={row.key} className="px-4 py-1.5">
      <div className="flex min-h-12 items-center gap-3">
        <DietMark diet={row.diet} />
        <span className="min-w-0 flex-1 text-[17px] [overflow-wrap:anywhere]">{row.name}</span>
        <TextField
          label={`Price of ${row.name}`}
          labelHidden
          inset
          prefix="₹"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          className="w-28 shrink-0 [&_input]:text-right"
          value={row.price}
          aria-invalid={error?.price ? true : undefined}
          onChange={(e) => onPrice(e.target.value)}
        />
      </div>
      <FieldError>{priceMessage(error?.price)}</FieldError>
    </div>
  );
}

function OwnRow({
  row,
  error,
  autoFocus,
  onChange,
}: {
  row: Extract<DishRow, { kind: "own" }>;
  error?: DishRowError;
  autoFocus: boolean;
  onChange: (patch: { name?: string; price?: string; diet?: DishRow["diet"] }) => void;
}) {
  return (
    <div data-row={row.key} className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <TextField
          label="Dish name"
          labelHidden
          inset
          placeholder="Dish name"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={NAME_MAX.item + 10}
          autoFocus={autoFocus}
          className="min-w-0 flex-1"
          value={row.name}
          error={nameMessage(error?.name, NAME_MAX.item)}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <TextField
          label={`Price of ${row.name || "this dish"}`}
          labelHidden
          inset
          prefix="₹"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          className="w-28 shrink-0 [&_input]:text-right"
          value={row.price}
          error={priceMessage(error?.price)}
          onChange={(e) => onChange({ price: e.target.value })}
        />
      </div>
      <SegmentedControl label="Veg, non-veg or egg" options={DIET_OPTIONS} value={row.diet} invalid={Boolean(error?.diet)} onChange={(diet) => onChange({ diet })} />
      <FieldError>{error?.diet ? "Veg, non-veg or egg?" : undefined}</FieldError>
    </div>
  );
}
