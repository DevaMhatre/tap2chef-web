import { useRef, useState } from "react";
import type { ExpenseDraft, ExpenseId } from "../../../domain/expense";
import type { NoteError } from "../../../usecases/expenseBook";
import type { ReadyExpenses } from "../../../usecases/useExpenses";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { dayLabel, formatPrice } from "../../format";
import { METHOD_LABEL } from "../order/labels";

type Props = { open: boolean; screen: ReadyExpenses; onClose: () => void };

// Note what went out: how much, what for, from which drawer. The amount comes
// first because it is what people carry in their head.
export function ExpenseSheet({ open, screen, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="New Expense">
      {open && <ExpenseForm screen={screen} onClose={onClose} />}
    </Sheet>
  );
}

const AMOUNT_ERRORS: Partial<Record<NoteError, string>> = {
  badAmount: "Enter the amount, like 340 or 120.50.",
  zero: "An expense can't be ₹0.",
};
const NOTE_ERRORS: Partial<Record<NoteError, string>> = {
  noNote: "Say what it was for.",
  tooLong: "Keep it short.",
};

function ExpenseForm({ screen, onClose }: { screen: ReadyExpenses; onClose: () => void }) {
  const showUndo = useUndoToast();
  // Fixed when the sheet opens, so saving twice can't note it twice.
  const [id] = useState<ExpenseId>(() => screen.newId());
  // Visual-only state: what has been typed. Most spending is cash, so it starts there.
  const [draft, setDraft] = useState<ExpenseDraft>({ amount: "", method: "cash", note: "", day: screen.today });
  const [error, setError] = useState<NoteError>();
  const [failure, setFailure] = useState<string>();
  const busy = useRef(false);
  const edit = (patch: Partial<ExpenseDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(undefined);
  };

  async function save() {
    if (busy.current) return;
    busy.current = true;
    try {
      setFailure(undefined);
      const result = await screen.note(id, draft);
      if (!result.ok) return setError(result.error);
      haptic();
      onClose();
      showUndo(`${result.value.expense.note} · ${formatPrice(result.value.expense.amount)} noted`, result.value.undo);
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    } finally {
      busy.current = false;
    }
  }

  const [today, yesterday] = screen.entryDays;
  return (
    <div className="space-y-4">
      <TextField
        label="Amount"
        prefix="₹"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        placeholder="0"
        value={draft.amount}
        error={error && AMOUNT_ERRORS[error]}
        onChange={(e) => edit({ amount: e.target.value })}
      />

      <div>
        <TextField
          label="What for"
          placeholder="Vegetables, gas, repair…"
          autoComplete="off"
          enterKeyHint="done"
          value={draft.note}
          error={error && NOTE_ERRORS[error]}
          onChange={(e) => edit({ note: e.target.value })}
        />
        {screen.suggestions.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Earlier notes">
            {screen.suggestions.map((note) => (
              <li key={note}>
                <button
                  type="button"
                  // Keep focus (and the phone keyboard) in the field being typed in.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => edit({ note })}
                  className="min-h-11 max-w-56 truncate rounded-full bg-surface px-4 text-[15px] font-medium active:bg-surface-2"
                >
                  {note}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SegmentedControl
        label="Paid from"
        value={draft.method}
        onChange={(method) => edit({ method })}
        options={[
          { value: "cash", label: METHOD_LABEL.cash },
          { value: "upi", label: METHOD_LABEL.upi },
        ]}
      />
      <SegmentedControl
        label="Day"
        value={draft.day}
        onChange={(day) => edit({ day })}
        options={[
          { value: today, label: dayLabel(today, today) },
          { value: yesterday, label: dayLabel(yesterday, today) },
        ]}
      />

      {failure && <p className="px-1 text-[13px] font-medium text-primary">{failure}</p>}
      <Button className="w-full" onClick={save}>
        Save Expense
      </Button>
    </div>
  );
}
