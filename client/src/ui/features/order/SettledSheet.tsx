import { useRef, useState } from "react";
import type { Paise } from "../../../domain/money";
import { counts, isLive, lineTotal, ticketOf, type Payment, type PaymentId } from "../../../domain/order";
import type { PaymentMethod } from "../../../domain/settlement";
import type { ReadyOrders, SettledSummary } from "../../../usecases/useOrders";
import { Button } from "../../design-system/Button";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { formatPrice, formatTime } from "../../format";
import { METHOD_LABEL, orderTitle } from "./labels";
import { PaymentRow } from "./PaymentRow";

type Props = { bill: SettledSummary | null; orders: ReadyOrders; onClose: () => void };

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: METHOD_LABEL.cash },
  { value: "upi", label: METHOD_LABEL.upi },
];

// A paid bill: what the table had and how it paid. It never reopens; only
// how each payment came in can be put right, and it then says so.
export function SettledSheet({ bill, orders, onClose }: Props) {
  return bill ? <Opened key={bill.order.id} bill={bill} orders={orders} onClose={onClose} /> : null;
}

function Opened({ bill, orders, onClose }: { bill: SettledSummary; orders: ReadyOrders; onClose: () => void }) {
  const { state } = bill.order;
  const { payments, discount, subtotal, paid, remaining } = bill.bill;
  // Visual-only state: the methods being chosen, until Save.
  const [methods, setMethods] = useState<Record<PaymentId, PaymentMethod>>(() =>
    Object.fromEntries(payments.map((p) => [p.id, p.method])),
  );
  const [failure, setFailure] = useState<string>();
  const saving = useRef(false);
  const showUndo = useUndoToast();
  const changed = payments.filter((p) => counts(p) && methods[p.id] !== p.method);

  async function remove(payment: Payment) {
    try {
      const result = await orders.removePayment(payment.id);
      if (!result.ok) return;
      haptic();
      showUndo(`${METHOD_LABEL[payment.method]} ${formatPrice(payment.amount)} removed`, result.value);
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    }
  }

  async function save() {
    if (saving.current) return;
    saving.current = true;
    try {
      for (const p of changed) await orders.correctPayment(p.id, methods[p.id]!);
      haptic();
      onClose();
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    } finally {
      saving.current = false;
    }
  }

  // As the kitchen got them, round by round; cancelled dishes were never charged.
  const lines = ticketOf(bill.lines).rounds.flatMap((r) => r.lines.filter(isLive));

  return (
    <Sheet
      open
      onClose={onClose}
      title={orderTitle(bill.label)}
      dismissLabel={changed.length > 0 ? "Cancel" : null}
      action={
        changed.length > 0 ? (
          <Button size="compact" onClick={save}>
            Save
          </Button>
        ) : (
          <Button size="compact" variant="tinted" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      <div className="space-y-6">
        <section className="pt-1 text-center">
          <p className="text-[40px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(paid)}</p>
          <p className="mt-2 text-[15px] text-muted">
            Settled {formatTime(state.settledAt)}
            {discount && (
              <>
                {" · "}
                <span className="tabular-nums line-through">{formatPrice(subtotal)}</span> {formatPrice(discount.amount)} off
                {discount.reason && ` · ${discount.reason}`}
              </>
            )}
          </p>
        </section>

        {failure && <p className="rounded-xl bg-primary/12 px-4 py-3 text-[15px] font-medium text-primary">{failure}</p>}

        {remaining < 0 && (
          <p className="rounded-xl bg-warning/15 px-4 py-3 text-[15px] font-medium">
            {formatPrice(-remaining as Paise)} more than the bill was received — taken twice? Remove the extra payment.
          </p>
        )}

        {payments.length > 0 && (
          <ListSection
            header="Paid by"
            footer={remaining < 0 ? undefined : "Got the method wrong? Change it here; the amount stays."}
          >
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p}>
                {/* An excess is fixed first: Remove. Otherwise only the method can change. */}
                {remaining < 0
                  ? orders.canRemove(bill, p) && (
                      <Button variant="plain" size="compact" className="-mr-3" onClick={() => remove(p)}>
                        Remove
                      </Button>
                    )
                  : counts(p) && (
                      <div className="w-40 shrink-0">
                        <SegmentedControl
                          label={`${formatPrice(p.amount)} paid by`}
                          options={METHODS}
                          value={methods[p.id] ?? p.method}
                          onChange={(method) => setMethods((current) => ({ ...current, [p.id]: method }))}
                        />
                      </div>
                    )}
              </PaymentRow>
            ))}
          </ListSection>
        )}

        <ListSection header="Dishes">
          {lines.map((line) => (
            <div key={line.id} className="flex min-h-11 items-center gap-3 px-4 py-2 text-[17px]">
              <span className="w-8 shrink-0 text-[15px] text-muted tabular-nums">{line.quantity}×</span>
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <span className="tabular-nums">{formatPrice(lineTotal(line))}</span>
            </div>
          ))}
        </ListSection>
      </div>
    </Sheet>
  );
}
