import { useState } from "react";
import { MdCheck } from "react-icons/md";
import type { OrderLine, VoidReason } from "../../../domain/order";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { ListRow, ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { Stepper } from "../../design-system/Stepper";
import { useUndoToast } from "../../design-system/UndoToast";
import { VOID_REASONS } from "./labels";

type Props = { line: OrderLine | null; screen: ReadyOrder; onClose: () => void };

// The kitchen already has this dish. Cancelling never slows anyone down — the
// reason is optional — but it is kept, and shows in the day's numbers.
export function VoidSheet({ line, screen, onClose }: Props) {
  return (
    <Sheet open={line !== null} onClose={onClose} title="Cancel Dish" dismissLabel="Back">
      {line && <VoidForm key={line.id} line={line} screen={screen} onClose={onClose} />}
    </Sheet>
  );
}

function VoidForm({ line, screen, onClose }: { line: OrderLine; screen: ReadyOrder; onClose: () => void }) {
  const showUndo = useUndoToast();
  const [quantity, setQuantity] = useState(line.quantity);
  const [reason, setReason] = useState<VoidReason>();

  async function cancel() {
    const result = await screen.voidLine(line.id, quantity, reason);
    onClose();
    if (!result.ok) return;
    haptic();
    showUndo(reason === "outOfStock" ? `${line.name} is out today` : `Cancelled ${quantity} ${line.name}`, result.value);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2">
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-semibold">{line.name}</span>
          <span className="block text-[13px] text-muted">Already sent to the kitchen</span>
        </span>
        {line.quantity > 1 && (
          <Stepper value={quantity} label={line.name} max={line.quantity} onStep={(by) => setQuantity((q) => q + by)} />
        )}
      </div>

      <ListSection header="Why? (optional)">
        {VOID_REASONS.map((r) => (
          <ListRow
            key={r.value}
            role="radio"
            aria-checked={reason === r.value}
            trailing={reason === r.value ? <MdCheck aria-hidden className="text-xl text-primary" /> : null}
            onClick={() => setReason((current) => (current === r.value ? undefined : r.value))}
          >
            {r.label}
          </ListRow>
        ))}
      </ListSection>

      <Button className="w-full" onClick={cancel}>
        Cancel {quantity} {line.name}
      </Button>
    </div>
  );
}
