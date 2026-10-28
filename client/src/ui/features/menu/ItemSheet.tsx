import { useState, type FormEvent } from "react";
import { itemToDraft, type CategoryId, type ItemDraftErrors, type MenuItem, type ProfileId } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { FieldError, SelectField, TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { Switch } from "../../design-system/Switch";
import { useUndoToast } from "../../design-system/UndoToast";
import { categoriesOf } from "./NewCategoryField";
import { categoryMessage, dietMessage, itemNameMessage, priceMessage } from "./display";
import { DIET_OPTIONS } from "./QuickAddSheet";

const FORM_ID = "item-form";

type Props = { item: MenuItem | null; menu: ReadyMenuBuilder; onClose: () => void };

export function ItemSheet({ item, menu, onClose }: Props) {
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title="Edit Item"
      action={
        <Button size="compact" type="submit" form={FORM_ID}>
          Save
        </Button>
      }
    >
      {item && <ItemForm key={item.id} item={item} menu={menu} onClose={onClose} />}
    </Sheet>
  );
}

function ItemForm({ item, menu, onClose }: { item: MenuItem; menu: ReadyMenuBuilder; onClose: () => void }) {
  const showUndo = useUndoToast();
  const initial = itemToDraft(item);
  const [draft, setDraft] = useState(initial);
  // Every list's price text survives switching "sold here" off and on again.
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(menu.profiles.map((p) => [p.id, initial.prices[p.id] ?? ""])),
  );
  const [errors, setErrors] = useState<ItemDraftErrors>({});

  const sold = (id: ProfileId) => draft.prices[id] !== undefined;
  const setSold = (id: ProfileId, on: boolean) =>
    setDraft((d) => {
      const prices = { ...d.prices };
      if (on) prices[id] = texts[id] ?? "";
      else delete prices[id];
      return { ...d, prices };
    });
  const setText = (id: ProfileId, text: string) => {
    setTexts((t) => ({ ...t, [id]: text }));
    setDraft((d) => ({ ...d, prices: { ...d.prices, [id]: text } }));
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = await menu.saveItem(item.id, draft);
    if (!result.ok) return setErrors(result.error);
    haptic();
    onClose();
  }

  async function remove() {
    const undo = await menu.removeItem(item.id);
    onClose();
    showUndo(`Deleted ${item.name}`, undo);
  }

  return (
    <form id={FORM_ID} onSubmit={save} className="space-y-5" noValidate>
      <TextField
        label="Name"
        autoCapitalize="words"
        autoComplete="off"
        value={draft.name}
        error={itemNameMessage(errors)}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
      />

      <SelectField
        label="Category"
        value={draft.categoryId ?? ""}
        error={categoryMessage(errors)}
        onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value as CategoryId }))}
      >
        {categoriesOf(menu).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>

      <div>
        <SegmentedControl
          label="Veg or non-veg"
          options={DIET_OPTIONS}
          value={draft.diet}
          invalid={Boolean(errors.diet)}
          onChange={(diet) => setDraft((d) => ({ ...d, diet }))}
        />
        <FieldError>{dietMessage(errors)}</FieldError>
      </div>

      <ListSection
        header="Prices"
        footer={errors.profiles ? undefined : "Switch a list off to stop selling this item there."}
      >
        {menu.profiles.map((profile) => (
          <div key={profile.id} className="flex min-h-11 items-center gap-3 py-1.5 pr-2 pl-4">
            <span className="min-w-0 flex-1 truncate text-[17px]">{profile.name}</span>
            {sold(profile.id) ? (
              <TextField
                label={`${profile.name} price`}
                labelHidden
                inset
                prefix="₹"
                inputMode="decimal"
                autoComplete="off"
                className="w-28"
                value={texts[profile.id] ?? ""}
                error={priceMessage(errors.prices?.[profile.id])}
                onChange={(e) => setText(profile.id, e.target.value)}
              />
            ) : (
              <span className="text-[15px] text-muted">Not sold</span>
            )}
            <Switch
              label={`Sold in ${profile.name}`}
              checked={sold(profile.id)}
              onChange={(on) => setSold(profile.id, on)}
            />
          </div>
        ))}
      </ListSection>
      {errors.profiles && <FieldError>Sell it in at least one list.</FieldError>}

      <Button variant="destructive" className="w-full" onClick={remove}>
        Delete Item
      </Button>
    </form>
  );
}
