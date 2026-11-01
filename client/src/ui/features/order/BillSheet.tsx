import { useRef, useState } from "react";
import { toRupeeText, type Paise } from "../../../domain/money";
import { counts, dishCount, type Payment } from "../../../domain/order";
import { nameKey, owedBy, type Regular } from "../../../domain/dues";
import { readPhone, type BillInput, type TenderMethod } from "../../../domain/settlement";
import { useDues } from "../../../usecases/useDues";
import type { Undo } from "../../../usecases/orderDesk";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { formatPhone, formatPrice } from "../../format";
import { orderTitle, paidByLabel, TENDER_LABEL, tenderLabel } from "./labels";
import { PaymentRow } from "./PaymentRow";
import { useCan } from "../../../usecases/usePermissions";

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


const METHODS: { value: TenderMethod; label: string }[] = [
  { value: "cash", label: TENDER_LABEL.cash },
  { value: "upi", label: TENDER_LABEL.upi },
  { value: "later", label: TENDER_LABEL.later },
];

export type Settled = { paid: Paise; method: string; change: Paise; undo: Undo };

function BillForm({ screen, onSettled, onClose }: Omit<Props, "open">) {
  // Visual-only state: what has been typed, which parts are showing.
  const [input, setInput] = useState<BillInput>(screen.billInput);
  const can = useCan();
  // An agreed discount opens for editing only where discounts can be given.
  const [adjusting, setAdjusting] = useState(screen.billInput.finalAmount !== "" && can("bills.discount"));
  const [failure, setFailure] = useState<string>();
  const busy = useRef(false);
  const showUndo = useUndoToast();

  const quote = screen.quote(input);
  const { subtotal, due, paid, remaining, discount, receipt, tender, settles } = quote;
  const dues = useDues();
  const { payments } = screen.bill;
  const edit = (patch: Partial<BillInput>) => setInput((current) => ({ ...current, ...patch }));
  // Choosing a method fills in what is left: the usual case is one tap away
  // from Settle, and a part payment is one edit away.
  const choose = (method: TenderMethod) =>
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
      const how = tender!.ok ? tender!.value : ({ method: "cash" } as const);
      const result = await screen.receive(input);
      if (!result.ok) return explain(result.error);
      const { settled, undo, change } = result.value;
      if (settled) {
        const all = [...payments.filter(counts), how];
        return onSettled({ paid: due, method: all.every((p) => p.method === how.method) ? tenderLabel(how) : paidByLabel(all), change, undo });
      }
      // A part: the sheet stays, ready for the rest.
      haptic();
      const amount = formatPrice(receipt!.ok ? receipt!.value.amount : (0 as Paise));
      showUndo(how.method === "later" ? `${amount} on ${how.customer}` : `${tenderLabel(how)} ${amount} received`, undo);
      setInput((current) => ({ ...current, method: null, received: "", customer: "" }));
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    } finally {
      busy.current = false;
    }
  }

  // A wrong payment comes off at once, with Undo: forgiveness, not a dialog.
  async function remove(payment: Payment) {
    try {
      const result = await screen.removePayment(payment.id);
      if (!result.ok) return;
      haptic();
      showUndo(`${tenderLabel(payment)} ${formatPrice(payment.amount)} removed`, result.value);
    } catch {
      setFailure("Couldn't save on this device. Try again.");
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
  const later = input.method === "later";
  const label = later
    ? `Pay Later ${formatPrice(receipt?.ok ? receipt.value.amount : (Math.max(0, remaining) as Paise))}`
    : receipt?.ok && !settles
      ? `Received ${formatPrice(receipt.value.amount)}`
      : `Settle ${formatPrice(Math.max(0, remaining) as Paise)}`;

  return (
    <div className="space-y-6">
      <section className="pt-2 text-center">
        <p className={`text-[44px] leading-none font-bold tracking-tight tabular-nums ${remaining < 0 ? "text-warning" : ""}`}>
          {formatPrice(Math.abs(remaining) as Paise)}
        </p>
        <p className="mt-2 text-[15px] text-muted">
          {remaining < 0 ? (
            <>
              extra · <span className="tabular-nums">{formatPrice(paid)}</span> received for {formatPrice(due)}
            </>
          ) : paid > 0 ? (
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
        {/* At the first restaurant only the owner gives a discount. */}
        {!adjusting && can("bills.discount") && (
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

      {remaining < 0 && (
        <p className="rounded-xl bg-warning/15 px-4 py-3 text-[15px] font-medium">
          {formatPrice(-remaining as Paise)} more than the bill was received — taken twice? Remove the extra payment.
        </p>
      )}

      {payments.length > 0 && (
        <ListSection header="Received">
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p}>
              {counts(p) && can("payments.remove") && (
                <Button variant="plain" size="compact" className="-mr-3" onClick={() => remove(p)}>
                  Remove
                </Button>
              )}
            </PaymentRow>
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
              <SegmentedControl
                label="How did they pay?"
                options={can("payments.later") ? METHODS : METHODS.filter((m) => m.value !== "later")}
                value={input.method}
                onChange={choose}
              />
              {later && (
                <CustomerField
                  name={input.customer}
                  phone={input.phone}
                  regulars={dues.state === "ready" ? dues.regulars : []}
                  owes={(phone) => (dues.state === "ready" ? owedBy(dues.dues, phone) : 0)}
                  adding={receipt?.ok ? receipt.value.amount : (0 as Paise)}
                  nameError={tender && !tender.ok && tender.error === "tooLong" ? "Keep the name short." : undefined}
                  onChange={(patch) => edit(patch)}
                />
              )}
              {input.method && (
                <div className="space-y-1">
                  <TextField
                    label={input.method === "cash" ? "Cash received" : later ? "On their name" : "UPI received"}
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
                      {later ? "Part on their name" : "Part payment"}: {formatPrice((remaining - receipt.value.amount) as Paise)} will still be due.
                    </p>
                  )}
                </div>
              )}
            </section>
            <div className="space-y-2">
              <Button className="min-h-14 w-full text-[19px]" disabled={!discount.ok || !receipt?.ok || !tender?.ok} onClick={() => commit("receive")}>
                {label}
              </Button>
              {!input.method && <p className="text-center text-[13px] text-muted">Choose how they paid.</p>}
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

const RECEIVED_ERRORS: Record<"invalid" | "zero" | "moreThanDue", (remaining: Paise, method: TenderMethod) => string> = {
  invalid: () => "Type an amount, like 500.",
  zero: () => "Type the amount.",
  moreThanDue: (remaining, method) => `${method === "later" ? "No" : "UPI is exact: no"} more than ${formatPrice(remaining)}.`,
};

// Whose name the bill goes on, and their mobile: the number is who they are.
// A regular already used is one tap and brings their number; a new one gives
// it once, and is offered from then on.
function CustomerField({
  name,
  phone,
  regulars,
  owes,
  adding,
  nameError,
  onChange,
}: {
  name: string;
  phone: string;
  regulars: Regular[];
  owes: (phone: string) => number;
  adding: Paise;
  nameError?: string;
  onChange: (patch: { customer?: string; phone?: string }) => void;
}) {
  const typed = nameKey(name);
  const mobile = readPhone(phone);
  const chosen = mobile.ok ? regulars.find((r) => r.phone === mobile.value) : undefined;
  const offered = regulars.filter((r) => r !== chosen && nameKey(r.name).startsWith(typed));
  const owed = mobile.ok ? owes(mobile.value) : 0;
  const digits = phone.replace(/\D/g, "").length;
  return (
    <div className="space-y-3">
      <TextField
        label="Whose name?"
        placeholder="e.g. Sharma ji"
        autoCapitalize="words"
        autoComplete="off"
        enterKeyHint="next"
        value={name}
        error={nameError}
        onChange={(e) => onChange({ customer: e.target.value })}
      />
      {offered.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {offered.map((r) => (
            <button
              key={r.phone}
              type="button"
              aria-label={`${r.name}, ${formatPhone(r.phone)}`}
              onClick={() => onChange({ customer: r.name, phone: formatPhone(r.phone) })}
              className="min-h-11 shrink-0 rounded-full bg-surface px-4 text-[15px] font-semibold transition-colors active:bg-surface-2"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="98765 43210"
        value={phone}
        error={!mobile.ok && mobile.error === "badPhone" && digits >= 10 ? "Ten digits, like 98765 43210." : undefined}
        hint={
          mobile.ok && typed !== ""
            ? `${name.trim()} will owe ${formatPrice((Math.max(0, owed) + adding) as Paise)}${owed > 0 ? `, ${formatPrice(owed as Paise)} from before` : ""}.`
            : "For a WhatsApp reminder, when it's time."
        }
        onChange={(e) => onChange({ phone: e.target.value })}
      />
    </div>
  );
}
