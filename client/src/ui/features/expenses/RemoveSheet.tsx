import { useRef } from "react";
import type { Expense } from "../../../domain/expense";
import type { ReadyExpenses } from "../../../usecases/useExpenses";
import { Button } from "../../design-system/Button";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { dayLabel, formatPrice, formatTime } from "../../format";
import { METHOD_LABEL } from "../order/labels";

type Props = { expense: Expense | null; screen: ReadyExpenses; onClose: () => void };

// A wrong expense comes off at once, with Undo: forgiveness, not a dialog.
// It stays listed, struck through, so nothing quietly disappears.
export function RemoveSheet({ expense, screen, onClose }: Props) {
  const showUndo = useUndoToast();
  const busy = useRef(false);

  async function remove() {
    if (!expense || busy.current) return;
    busy.current = true;
    try {
      const result = await screen.remove(expense.id);
      onClose();
      if (!result.ok) return;
      haptic();
      showUndo(`${expense.note} · ${formatPrice(expense.amount)} removed`, result.value);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Sheet open={expense !== null} onClose={onClose} title="Expense" dismissLabel="Back">
      {expense && (
        <div className="space-y-6">
          <section className="pt-2 text-center">
            <p className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(expense.amount)}</p>
            <p className="mt-2 text-[17px] font-semibold">{expense.note}</p>
            <p className="mt-1 text-[15px] text-muted">
              {METHOD_LABEL[expense.method]} · {dayLabel(expense.businessDate, screen.today)}, noted {formatTime(expense.recordedAt)}
            </p>
          </section>
          {expense.removedAt === undefined ? (
            <Button variant="destructive" className="w-full" onClick={remove}>
              Remove Expense
            </Button>
          ) : (
            <p className="text-center text-[15px] text-muted">Removed {formatTime(expense.removedAt)}. It no longer counts.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
