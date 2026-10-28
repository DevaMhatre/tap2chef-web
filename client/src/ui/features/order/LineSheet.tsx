import { useState } from "react";
import { NOTE_MAX, type OrderLine } from "../../../domain/order";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";

type Props = { line: OrderLine | null; screen: ReadyOrder; onClose: () => void };

const FORM_ID = "line-note";

// A dish still in the cart: a note for the kitchen, or taking it off.
export function LineSheet({ line, screen, onClose }: Props) {
  return (
    <Sheet
      open={line !== null}
      onClose={onClose}
      title={line?.name ?? ""}
      action={
        <Button size="compact" type="submit" form={FORM_ID}>
          Save
        </Button>
      }
    >
      {line && <LineForm key={line.id} line={line} screen={screen} onClose={onClose} />}
    </Sheet>
  );
}

function LineForm({ line, screen, onClose }: { line: OrderLine; screen: ReadyOrder; onClose: () => void }) {
  const showUndo = useUndoToast();
  const [note, setNote] = useState(line.note);
  const [error, setError] = useState<string>();

  async function save() {
    const result = await screen.setNote(line.id, note);
    if (!result.ok && result.error === "tooLong") return setError(`Keep it under ${NOTE_MAX} characters`);
    onClose();
  }

  async function remove() {
    const result = await screen.removeLine(line.id);
    onClose();
    if (result.ok) showUndo(`Removed ${line.name}`, result.value);
  }

  return (
    <form
      id={FORM_ID}
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField
        label="Note for the kitchen"
        placeholder="e.g. less spicy, no onion"
        autoFocus
        autoComplete="off"
        enterKeyHint="done"
        value={note}
        error={error}
        onChange={(e) => {
          setNote(e.target.value);
          setError(undefined);
        }}
      />
      <Button variant="destructive" className="w-full" onClick={remove}>
        Remove {line.name}
      </Button>
    </form>
  );
}
