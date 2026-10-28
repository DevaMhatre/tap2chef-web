import { useRef, useState } from "react";
import { toRupeeText, type Paise } from "../../../domain/money";
import { dishCount } from "../../../domain/order";
import type { BillInput, PaymentMethod } from "../../../domain/settlement";
import type { Undo } from "../../../usecases/orderDesk";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { formatPrice, formatTime } from "../../format";
import { METHOD_LABEL, orderTitle } from "./labels";

type Props = {
  open: boolean;
  screen: ReadyOrder;
  onClose: () => void;
  /** Settled: the job is done. `undo` reopens the bill for a few seconds. */
  onSettled: (settled: Settled) => void;
};

// The guest has the bill; money comes in, maybe in parts. Choosing Cash or
// UPI only chooses. Settling is its own button that says what it will do.
export function BillSheet({ open, screen, onClose, onSettled }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={orderTitle(screen.label)} dismissLabel="Back">
      {open && <BillForm screen={screen} onSettled={onSettled} onClose={onClose} />}
    </Sheet>
  );
}


const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: METHOD_LABEL.cash },
  { value: "upi", label: METHOD_LABEL.upi },
];

export type Settled = { paid: Paise; method: string; change: Paise; undo: Undo };

function BillForm({ screen, onSettled, onClose }: Omit<Props, "open">) {
  // Visual-only state: what has been typed, which parts are showing.
  const [input, setInput] = useState<BillInput>(screen.billInput);
  const [adjusting, setAdjusting] = useState(screen.billInput.finalAmount !== "");
  const [failure, setFailure] = useState<string>();
  const busy = useRef(false);
  const showUndo = useUndoToast();

  const quote = screen.quote(input);
  const { subtotal, due, paid, remaining, discount, receipt, settles } = quote;
  const { payments } = screen.bill;
  const edit = (patch: Partial<BillInput>) => setInput((current) => ({ ...current, ...patch }));
  // Choosing a method fills in what is left: the usual case is one tap away
  // from Settle, and a part payment is one edit away.
  const choose = (method: PaymentMethod) =>
    edit({ method, received: input.received === "" && remaining > 0 ? toRupeeText(remaining as Paise) : input.received });

  const amountError = !discount.ok ? DISCOUNT_ERRORS[discount.error]?.(subtotal, paid) : undefined;
  const reasonError = !discount.ok && discount.error === "tooLong" ? "Keep it short." : undefined;
  const receivedError =
    receipt && !receipt.ok && receipt.error !== "empty" ? RECEIVED_ERRORS[receipt.error](remaining as Paise, input.method!) : undefined;

  async function commit(action: "receive" | "close") {
    if (busy.current) return;
    busy.current = true;
    try {
      setFailure(undefined);
      if (action === "close") {
        const result = await screen.closeBill(input);
        if (result.ok) {
          return onSettled({ paid, method: "Nothing to pay", change: 0 as Paise, undo: result.value });
        }
        return explain(result.error);
      }
      const method = input.method!;
      const result = await screen.receive(input);
      if (!result.ok) return explain(result.error);
      const { settled, undo, change } = result.value;
      if (settled) {
        const methods = new Set([...payments.map((p) => p.method), method]);
        return onSettled({ paid: due, method: methods.size > 1 ? "Cash + UPI" : METHOD_LABEL[method], change, undo });
      }
      // A part: the sheet stays, ready for the rest.
      haptic();
      showUndo(`${METHOD_LABEL[method]} ${formatPrice(receipt!.ok ? receipt!.value.amount : (0 as Paise))} received`, undo);
      setInput((current) => ({ ...current, method: null, received: "" }));
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    } finally {
      busy.current = false;
    }
  }

  function explain(error: string) {
    // Settled or gone on another screen: nothing left to do here.
    if (error === "notBilled" || error === "missing") return onClose();
    setFailure(
      error === "unsent"
        ? "A dish was added. Send it to the kitchen first."
        : error === "overpaid"
          ? "More than the bill has been received. Check the payments."
          : "This bill just changed on another screen. Check the amount and try again.",
    );
  }

  const dishes = dishCount(screen.ticket.rounds.flatMap((r) => r.lines));
  const nothingLeft = discount.ok && remaining === 0;
  const label = receipt?.ok && !settles ? `Received ${formatPrice(receipt.value.amount)}` : `Settle ${formatPrice(Math.max(0, remaining) as Paise)}`;

  return (
    <div className="space-y-6">
      <section className="pt-2 text-center">
        <p className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(Math.max(0, remaining) as Paise)}</p>
        <p className="mt-2 text-[15px] text-muted">
          {paid > 0 ? (
            <>
              to go · <span className="tabular-nums">{formatPrice(paid)}</span> of {formatPrice(due)} paid
            </>
          ) : discount.ok && discount.value ? (
            <>
              <span className="tabular-nums line-through">{formatPrice(subtotal)}</span> · {formatPrice(discount.value.amount)} off
              {discount.value.reason && ` · ${discount.value.reason}`}
            </>
          ) : (
            `${dishes} ${dishes === 1 ? "dish" : "dishes"}`
          )}
        </p>
        {!adjusting && (
          <Button variant="plain" size="compact" className="mt-1" onClick={() => setAdjusting(true)}>
            Round off or discount
          </Button>
        )}
      </section>

      {adjusting && (
        <div className="space-y-3">
          <TextField
            label="Guest pays"
            prefix="₹"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder={toRupeeText(subtotal)}
            value={input.finalAmount}
            error={amountError}
            hint="The difference is recorded as a discount."
            onChange={(e) => edit({ finalAmount: e.target.value })}
          />
          <TextField
            label="Reason (optional)"
            placeholder="Regular, round off…"
            autoComplete="off"
            enterKeyHint="done"
            value={input.reason}
            error={reasonError}
            onChange={(e) => edit({ reason: e.target.value })}
          />
        </div>
      )}

      {payments.length > 0 && (
        <ListSection header="Received">
          {payments.map((p) => (
            <div key={p.id} className="flex min-h-11 items-center justify-between px-4 py-2 text-[17px]">
              <span>
                {METHOD_LABEL[p.method]} <span className="text-[15px] text-muted">· {formatTime(p.receivedAt)}</span>
              </span>
              <span className="tabular-nums">{formatPrice(p.amount)}</span>
            </div>
          ))}
        </ListSection>
      )}

      {failure && <p className="rounded-xl bg-primary/12 px-4 py-3 text-[15px] font-medium text-primary">{failure}</p>}

      {nothingLeft ? (
        <Button className="w-full" onClick={() => commit("close")}>
          Close bill
        </Button>
      ) : (
        remaining > 0 && (
          <>
            <section className="space-y-3">
              <h3 className="px-1 text-[13px] font-semibold text-muted">How did they pay?</h3>
              <SegmentedControl label="How did they pay?" options={METHODS} value={input.method} onChange={choose} />
              {input.method && (
                <div className="space-y-1">
                  <TextField
                    label={input.method === "cash" ? "Cash received" : "UPI received"}
                    prefix="₹"
                    inputMode="decimal"
                    autoComplete="off"
                    value={input.received}
                    error={receivedError}
                    onChange={(e) => edit({ received: e.target.value })}
                  />
                  {receipt?.ok && receipt.value.change > 0 && (
                    <p aria-live="polite" className="px-1 text-right text-[20px] font-bold text-success tabular-nums">
                      Change {formatPrice(receipt.value.change)}
                    </p>
                  )}
                  {receipt?.ok && !settles && (
                    <p className="px-1 text-[13px] text-muted">
                      Part payment: {formatPrice((remaining - receipt.value.amount) as Paise)} will still be due.
                    </p>
                  )}
                </div>
              )}
            </section>
            <div className="space-y-2">
              <Button className="min-h-14 w-full text-[19px]" disabled={!discount.ok || !receipt?.ok} onClick={() => commit("receive")}>
                {label}
              </Button>
              {!input.method && <p className="text-center text-[13px] text-muted">Choose Cash or UPI to settle.</p>}
            </div>
          </>
        )
      )}
    </div>
  );
}

const DISCOUNT_ERRORS: Partial<Record<string, (subtotal: Paise, paid: Paise) => string>> = {
  invalid: () => "Type an amount, like 850.",
  upward: (subtotal) => `Can't be more than ${formatPrice(subtotal)}. Add a dish instead.`,
  belowPaid: (_, paid) => `${formatPrice(paid)} is already paid; it can't go below that.`,
};

const RECEIVED_ERRORS: Record<"invalid" | "zero" | "moreThanDue", (remaining: Paise, method: PaymentMethod) => string> = {
  invalid: () => "Type an amount, like 500.",
  zero: () => "Type the amount received.",
  moreThanDue: (remaining) => `UPI is exact: no more than ${formatPrice(remaining)}.`,
};
