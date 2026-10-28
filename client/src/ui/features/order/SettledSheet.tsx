import { useRef, useState } from "react";
import { toRupeeText, type Paise } from "../../../domain/money";
import { isLive, lineTotal, ticketOf } from "../../../domain/order";
import type { PayBy } from "../../../domain/settlement";
import type { ReadyOrders, SettledSummary } from "../../../usecases/useOrders";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { formatPrice, formatTime } from "../../format";
import { orderTitle } from "./labels";

type Props = { bill: SettledSummary | null; orders: ReadyOrders; onClose: () => void };

// A paid bill: what the table had and how it paid. It never reopens; only
// the method can be put right, and the bill then says it was corrected.
export function SettledSheet({ bill, orders, onClose }: Props) {
  return bill ? <Opened key={bill.order.id} bill={bill} orders={orders} onClose={onClose} /> : null;
}

const PAY_BY: { value: PayBy; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "split", label: "Split" },
];

function Opened({ bill, orders, onClose }: { bill: SettledSummary; orders: ReadyOrders; onClose: () => void }) {
  const { state } = bill.order;
  const { payments, discount, subtotal } = state.bill;
  const initialBy: PayBy = payments.length === 1 ? payments[0]!.method : "split";
  const initialCash = initialBy === "split" ? toRupeeText((payments.find((p) => p.method === "cash")?.amount ?? 0) as Paise) : "";

  // Visual-only state: the method being chosen, as typed.
  const [by, setBy] = useState<PayBy>(initialBy);
  const [cash, setCash] = useState(initialCash);
  const [failure, setFailure] = useState<string>();
  const saving = useRef(false);

  const split = orders.quoteSplit(bill.paid, cash);
  const changed = by !== initialBy || (by === "split" && cash !== initialCash);
  const valid = by !== "split" || split.ok;
  const upi = split.ok ? (split.value.find((p) => p.method === "upi")?.amount ?? 0) : undefined;
  const cashError =
    !split.ok && split.error === "invalid"
      ? "Type an amount, like 500."
      : !split.ok && split.error === "moreThanDue"
        ? `Can't be more than ${formatPrice(bill.paid)}.`
        : undefined;

  async function save() {
    if (saving.current) return;
    saving.current = true;
    try {
      const result = await orders.correct(bill.order.id, by, cash);
      if (!result.ok) return;
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
      dismissLabel={changed ? "Cancel" : null}
      action={
        changed ? (
          <Button size="compact" disabled={!valid} onClick={save}>
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
          <p className="text-[40px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(bill.paid)}</p>
          <p className="mt-2 text-[15px] text-muted">
            Paid {formatTime(state.settledAt)}
            {discount && (
              <>
                {" · "}
                <span className="tabular-nums line-through">{formatPrice(subtotal)}</span> {formatPrice(discount.amount)} off
                {discount.reason && ` · ${discount.reason}`}
              </>
            )}
          </p>
          {state.correctedAt && (
            <p className="mt-1 text-[13px] font-semibold text-warning">Payment corrected at {formatTime(state.correctedAt)}</p>
          )}
        </section>

        {failure && <p className="rounded-xl bg-primary/12 px-4 py-3 text-[15px] font-medium text-primary">{failure}</p>}

        {bill.paid > 0 && (
          <section className="space-y-3">
            <h3 className="px-1 text-[13px] font-semibold text-muted">Paid by</h3>
            <SegmentedControl label="Paid by" options={PAY_BY} value={by} onChange={setBy} />
            {by === "split" && (
              <div className="space-y-1 rounded-2xl bg-surface px-4 py-3">
                <TextField
                  label="Cash"
                  prefix="₹"
                  inputMode="decimal"
                  autoComplete="off"
                  inset
                  value={cash}
                  error={cashError}
                  onChange={(e) => setCash(e.target.value)}
                />
                <div className="flex min-h-11 items-center justify-between px-1 text-[17px]">
                  <span className="text-muted">UPI, the rest</span>
                  <span className="font-semibold tabular-nums">{upi === undefined ? "—" : formatPrice(upi as Paise)}</span>
                </div>
              </div>
            )}
          </section>
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
