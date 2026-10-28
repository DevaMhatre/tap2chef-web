import { useRef, useState, type FormEvent } from "react";
import { withPriceEverywhere, type CategoryId, type Diet, type ItemDraftErrors, type ItemId } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { DietMark } from "../../design-system/DietMark";
import { SelectField, TextField } from "../../design-system/Field";
import { ListRow, ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { categoriesOf, NewCategoryField } from "./NewCategoryField";
import { categoryMessage, dietMessage, firstPriceMessage, itemNameMessage, priceSummary } from "./display";

export const DIET_OPTIONS = [
  { value: "veg", label: <><DietMark diet="veg" decorative /> Veg</> },
  { value: "nonVeg", label: <><DietMark diet="nonVeg" decorative /> Non-veg</> },
  { value: "egg", label: <><DietMark diet="egg" decorative /> Egg</> },
] as const satisfies readonly { value: Diet; label: unknown }[];

const NEW_CATEGORY = "__new";

type Props = { open: boolean; onClose: () => void; menu: ReadyMenuBuilder };

// Built for setup day: type a dish, its price, Return — and straight on to the
// next one, with the category and veg mark remembered.
export function QuickAddSheet({ open, onClose, menu }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add Items"
      dismissLabel={null}
      action={
        <Button variant="plain" onClick={onClose}>
          Done
        </Button>
      }
    >
      <QuickAddForm menu={menu} />
    </Sheet>
  );
}

type Added = { id: ItemId; name: string; diet: Diet; summary: string };

type Form = ReturnType<ReadyMenuBuilder["newItem"]> & { price: string };
const isBlank = (f: Form) => f.draft.name.trim() === "" && f.price.trim() === "";

function QuickAddForm({ menu }: { menu: ReadyMenuBuilder }) {
  const categories = categoriesOf(menu);
  const [form, setForm] = useState<Form>(() => ({ ...menu.newItem(), price: "" }));
  const [addingCategory, setAddingCategory] = useState(false);
  const [errors, setErrors] = useState<ItemDraftErrors>({});
  const [failure, setFailure] = useState<string>();
  const [added, setAdded] = useState<Added[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const setDraft = (patch: Partial<typeof form.draft>) => setForm((f) => ({ ...f, draft: { ...f.draft, ...patch } }));
  const useCategory = (id: CategoryId) => {
    setDraft({ categoryId: id });
    setAddingCategory(false);
  };

  if (categories.length === 0) {
    return (
      <NewCategoryField
        menu={menu}
        label="First, name a category"
        placeholder="e.g. Starters"
        onAdded={useCategory}
      />
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const sent = form;
    // A second Return on an empty form (double tap) does nothing.
    if (isBlank(sent)) return;
    const saving = menu.saveItem(sent.id, withPriceEverywhere(sent.draft, sent.price));

    // Clear at once, keeping category and veg mark, so a fast typist can start
    // the next dish while this one saves. Put back below if it fails, unless
    // they've already started typing.
    const next = menu.newItem();
    const fresh: Form = { id: next.id, draft: { ...sent.draft, name: "", prices: next.draft.prices }, price: "" };
    setForm(fresh);
    setErrors({});
    setFailure(undefined);
    nameRef.current?.focus();
    const restore = () => setForm((f) => (f.id === fresh.id && isBlank(f) ? sent : f));

    let result: Awaited<typeof saving>;
    try {
      result = await saving;
    } catch {
      restore();
      setFailure("Couldn't save on this device. Try again.");
      return;
    }
    if (!result.ok) {
      restore();
      setErrors(result.error);
      (result.error.name ? nameRef : priceRef).current?.focus();
      return;
    }
    haptic();
    const item = result.value;
    setAdded((list) => [
      { id: sent.id, name: item.name, diet: item.diet, summary: priceSummary(item, menu.profiles) },
      ...list,
    ]);
  }

  async function undo(id: ItemId) {
    await menu.removeItem(id);
    setAdded((list) => list.filter((a) => a.id !== id));
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      {addingCategory ? (
        <NewCategoryField menu={menu} label="New category" onAdded={useCategory} onCancel={() => setAddingCategory(false)} />
      ) : (
        <SelectField
          label="Category"
          value={form.draft.categoryId ?? ""}
          error={categoryMessage(errors)}
          onChange={(e) =>
            e.target.value === NEW_CATEGORY ? setAddingCategory(true) : setDraft({ categoryId: e.target.value as CategoryId })
          }
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>New category…</option>
        </SelectField>
      )}

      <TextField
        ref={nameRef}
        label="Name"
        placeholder="e.g. Paneer Tikka"
        autoFocus
        autoCapitalize="words"
        autoComplete="off"
        enterKeyHint="next"
        value={form.draft.name}
        error={itemNameMessage(errors)}
        onChange={(e) => setDraft({ name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            priceRef.current?.focus();
          }
        }}
      />

      <TextField
        ref={priceRef}
        label="Price"
        prefix="₹"
        placeholder="0"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="enter"
        value={form.price}
        error={firstPriceMessage(errors)}
        hint={menu.profiles.length > 1 ? "Same price in every list. Change one later by tapping the item." : undefined}
        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
      />

      <div>
        <SegmentedControl
          label="Veg or non-veg"
          options={DIET_OPTIONS}
          value={form.draft.diet}
          invalid={Boolean(errors.diet)}
          onChange={(diet) => setDraft({ diet })}
        />
        {errors.diet && <p className="mt-1.5 px-1 text-[13px] font-medium text-primary">{dietMessage(errors)}</p>}
      </div>

      <div>
        <Button type="submit" className="w-full">
          Add Item
        </Button>
        {failure && <p className="mt-1.5 px-1 text-center text-[13px] font-medium text-primary">{failure}</p>}
      </div>

      {added.length > 0 && (
        <ListSection header={`Just added · ${added.length}`}>
          {added.map((a) => (
            <ListRow
              key={a.id}
              leading={<DietMark diet={a.diet} />}
              trailing={
                <span className="flex items-center gap-2">
                  <span className="text-[15px] text-muted tabular-nums">{a.summary}</span>
                  <span className="text-[15px] font-semibold text-primary">Undo</span>
                </span>
              }
              aria-label={`Undo adding ${a.name}`}
              onClick={() => undo(a.id)}
            >
              {a.name}
            </ListRow>
          ))}
        </ListSection>
      )}
    </form>
  );
}
