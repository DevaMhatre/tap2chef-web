import { useState } from "react";
import { isDuplicateName, NAME_MAX, type Category, type CategoryId } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { nameMessage } from "./display";

export const categoriesOf = (menu: ReadyMenuBuilder): Category[] =>
  menu.sections.flatMap((s) => (s.kind === "category" ? [s.category] : []));

type Props = {
  menu: ReadyMenuBuilder;
  label: string;
  placeholder?: string;
  onAdded: (id: CategoryId) => void;
  onCancel?: () => void;
};

// Inline, so naming a category never takes the owner out of adding items.
// It is not a <form>: it can sit inside the quick-add form.
export function NewCategoryField({ menu, label, placeholder, onAdded, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  async function add() {
    const result = await menu.addCategory(name);
    if (result.ok) onAdded(result.value.id);
    else setError(nameMessage(result.error, NAME_MAX.category));
  }

  const duplicate = isDuplicateName(name, categoriesOf(menu));
  return (
    <div className="space-y-3">
      <TextField
        label={label}
        placeholder={placeholder}
        autoFocus
        autoCapitalize="words"
        autoComplete="off"
        enterKeyHint="done"
        value={name}
        error={error}
        hint={duplicate ? "You already have a category with this name." : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void add();
          }
        }}
      />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={add}>
          {onCancel ? "Add Category" : "Next"}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
