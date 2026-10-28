import { useState, type FormEvent } from "react";
import { isDuplicateName, NAME_MAX, type Category } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { categoriesOf } from "./NewCategoryField";
import { nameMessage } from "./display";

const FORM_ID = "category-form";

export type CategoryTarget = { kind: "add" } | { kind: "edit"; category: Category; itemCount: number };

type Props = { target: CategoryTarget | null; menu: ReadyMenuBuilder; onClose: () => void };

export function CategorySheet({ target, menu, onClose }: Props) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={target?.kind === "edit" ? "Edit Category" : "New Category"}
      action={
        <Button size="compact" type="submit" form={FORM_ID}>
          {target?.kind === "edit" ? "Save" : "Add"}
        </Button>
      }
    >
      {target && (
        <CategoryForm key={target.kind === "edit" ? target.category.id : "add"} target={target} menu={menu} onClose={onClose} />
      )}
    </Sheet>
  );
}

function CategoryForm({ target, menu, onClose }: { target: CategoryTarget; menu: ReadyMenuBuilder; onClose: () => void }) {
  const showUndo = useUndoToast();
  const editing = target.kind === "edit" ? target.category : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [error, setError] = useState<string>();

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = editing ? await menu.renameCategory(editing.id, name) : await menu.addCategory(name);
    if (!result.ok) return setError(nameMessage(result.error, NAME_MAX.category));
    haptic();
    onClose();
  }

  async function remove() {
    if (!editing) return;
    const undo = await menu.removeCategory(editing.id);
    onClose();
    showUndo(`Deleted ${editing.name}`, undo);
  }

  const itemCount = target.kind === "edit" ? target.itemCount : 0;
  return (
    <form id={FORM_ID} onSubmit={save} className="space-y-5" noValidate>
      <TextField
        label="Name"
        placeholder="e.g. Starters"
        autoFocus
        autoCapitalize="words"
        autoComplete="off"
        value={name}
        error={error}
        hint={isDuplicateName(name, categoriesOf(menu), editing?.id) ? "You already have a category with this name." : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
      />
      {editing && (
        <div>
          <Button variant="destructive" className="w-full" onClick={remove}>
            Delete Category
          </Button>
          {itemCount > 0 && (
            <p className="mt-1.5 px-1 text-center text-[13px] text-muted">
              Its {itemCount === 1 ? "1 item goes" : `${itemCount} items go`} with it. You can undo.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
