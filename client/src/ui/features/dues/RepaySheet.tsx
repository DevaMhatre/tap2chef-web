import { useRef, useState } from "react";
import { MdChatBubbleOutline } from "react-icons/md";
import { businessDate } from "../../../domain/order";
import { toRupeeText, type Paise } from "../../../domain/money";
import type { Due } from "../../../domain/dues";
import type { PaymentMethod } from "../../../domain/settlement";
import { useRestaurantName } from "../../../usecases/useRestaurant";
import type { RepayError, useDues } from "../../../usecases/useDues";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { ListFact, ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { SegmentedControl } from "../../design-system/SegmentedControl";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { dayLabel, formatDay, formatPhone, formatPrice, formatTime } from "../../format";
import { METHOD_LABEL } from "../order/labels";

type Ready = Extract<ReturnType<typeof useDues>, { state: "ready" }>;
type Props = { due: Due | null; dues: Ready; onClose: () => void };

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: METHOD_LABEL.cash },
  { value: "upi", label: METHOD_LABEL.upi },
];

// A regular paying back: what they owe, the bills it came from, and the money,
// all or part. Choosing Cash or UPI only chooses; the button takes the money.
export function RepaySheet({ due, dues, onClose }: Props) {
  return (
    <Sheet open={due !== null} onClose={onClose} title={due?.customer ?? ""} dismissLabel="Back">
      {due && <RepayForm key={due.phone} due={due} dues={dues} onClose={onClose} />}
    </Sheet>
  );
}

function RepayForm({ due, dues, onClose }: { due: Due; dues: Ready; onClose: () => void }) {
  const [id] = useState(() => dues.newId());
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [given, setGiven] = useState("");
  const [failure, setFailure] = useState<string>();
  const busy = useRef(false);
  const showUndo = useUndoToast();
  const owed = Math.max(0, due.owed) as Paise;
  const restaurant = useRestaurantName();
  const receipt = method === null ? null : dues.quote(due, method, given);

  async function receive() {
    if (busy.current || method === null) return;
    busy.current = true;
    try {
      const result = await dues.receive(id, due.phone, method, given);
      if (!result.ok) return setFailure(REPAY_ERRORS[result.error](owed, method));
      haptic();
      onClose();
      const { repayment, change } = result.value;
      showUndo(
        `${METHOD_LABEL[method]} ${formatPrice(repayment.amount)} from ${due.customer}${change > 0 ? ` · change ${formatPrice(change)}` : ""}`,
        result.value.undo,
      );
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    } finally {
      busy.current = false;
    }
  }

  const history = [
    ...due.bills.map((b) => ({ key: b.paymentId, at: b.at, label: "Bill", amount: b.amount, back: false })),
    ...due.repayments.map((r) => ({ key: r.id, at: r.receivedAt, label: `Paid back · ${METHOD_LABEL[r.method]}`, amount: r.amount, back: true })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="space-y-6">
      <section className="pt-2 text-center">
        <p className={`text-[44px] leading-none font-bold tracking-tight tabular-nums ${due.owed < 0 ? "text-warning" : ""}`}>
          {formatPrice(Math.abs(due.owed) as Paise)}
        </p>
        <p className="mt-2 text-[15px] text-muted">
          {due.owed < 0 ? "paid back more than owed — taken twice?" : `owed${due.since ? ` since ${dayLabel(businessDate(due.since), dues.today).toLowerCase()}` : ""}`}
          {" · "}
          <span className="tabular-nums">{formatPhone(due.phone)}</span>
        </p>
        {due.owed > 0 && (
          <a
            href={whatsAppLink(due, restaurant)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 px-3 text-[17px] font-semibold text-primary"
          >
            <MdChatBubbleOutline aria-hidden className="text-xl" />
            Remind on WhatsApp
          </a>
        )}
      </section>

      {due.owed > 0 && (
        <section className="space-y-3">
          <h3 className="px-1 text-[13px] font-semibold text-muted">How are they paying?</h3>
          <SegmentedControl
            label="How are they paying?"
            options={METHODS}
            value={method}
            onChange={(m) => {
              setMethod(m);
              if (given === "") setGiven(toRupeeText(owed));
            }}
          />
          {method && (
            <div className="space-y-1">
              <TextField
                label={method === "cash" ? "Cash received" : "UPI received"}
                prefix="₹"
                inputMode="decimal"
                autoComplete="off"
                value={given}
                error={receipt && !receipt.ok ? REPAY_ERRORS[receipt.error](owed, method) : undefined}
                onChange={(e) => setGiven(e.target.value)}
              />
              {receipt?.ok && receipt.value.change > 0 && (
                <p aria-live="polite" className="px-1 text-right text-[20px] font-bold text-success tabular-nums">
                  Change {formatPrice(receipt.value.change)}
                </p>
              )}
              {receipt?.ok && receipt.value.amount < owed && (
                <p className="px-1 text-[13px] text-muted">Part: {formatPrice((owed - receipt.value.amount) as Paise)} will still be owed.</p>
              )}
            </div>
          )}
          {failure && <p className="rounded-xl bg-primary/12 px-4 py-3 text-[15px] font-medium text-primary">{failure}</p>}
          <Button className="min-h-14 w-full text-[19px]" disabled={!receipt?.ok} onClick={receive}>
            Received {formatPrice(receipt?.ok ? receipt.value.amount : owed)}
          </Button>
          {method === null && <p className="text-center text-[13px] text-muted">Choose Cash or UPI.</p>}
        </section>
      )}

      <ListSection header="On their name">
        {history.map((h) => (
          <ListFact
            key={h.key}
            label={h.label}
            detail={`${dayLabel(businessDate(h.at), dues.today)} · ${formatTime(h.at)}`}
            value={<span className={h.back ? "text-success" : ""}>{h.back ? "−" : ""}{formatPrice(h.amount)}</span>}
          />
        ))}
      </ListSection>
    </div>
  );
}

const REPAY_ERRORS: Record<RepayError, (owed: Paise, method: PaymentMethod) => string> = {
  invalid: () => "Type an amount, like 500.",
  zero: () => "Type the amount received.",
  moreThanDue: (owed) => `UPI is exact: no more than ${formatPrice(owed)}.`,
  nothingOwed: () => "Nothing is owed any more: it was just paid back on another phone.",
};

// The words of the reminder: polite, with the amount and where it's from,
// for the owner to send (and change) in WhatsApp. Nothing goes out by itself.
function whatsAppLink(due: Due, restaurant: string | undefined): string {
  const bills = `${due.bills.length} ${due.bills.length === 1 ? "bill" : "bills"}`;
  const since = due.since === undefined ? "" : `, since ${formatDay(businessDate(due.since)).replace(/^\w+ /, "")}`;
  const text = `Namaste ${due.customer}, ${formatPrice(due.owed as Paise)} is pending at ${restaurant ?? "our restaurant"} (${bills}${since}). Thank you!`;
  return `https://wa.me/91${due.phone}?text=${encodeURIComponent(text)}`;
}
