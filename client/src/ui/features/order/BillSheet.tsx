import { useRef, useState, type ReactNode } from "react";
import { MdCallSplit, MdPayments, MdQrCode2 } from "react-icons/md";
import type { Paise } from "../../../domain/money";
import { dishCount } from "../../../domain/order";
import type { BillInput } from "../../../domain/settlement";
import type { Undo } from "../../../usecases/orderDesk";
import type { PayBy, ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { Sheet } from "../../design-system/Sheet";
import { formatPrice } from "../../format";
import { orderTitle } from "./labels";

type Props = {
  open: boolean;
  screen: ReadyOrder;
  onClose: () => void;
  /** Settled: the sheet's job is done. `undo` reopens the bill for a few seconds. */
  onSettled: (paid: Paise, undo: Undo) => void;
};

// The guest is waiting with money in hand: the amount is the biggest thing
// on screen, and Cash or UPI settles it in one tap.
export function BillSheet({ open, screen, onClose, onSettled }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={orderTitle(screen.label)} dismissLabel="Back">
      {open && <BillForm screen={screen} onSettled={onSettled} onClose={onClose} />}
    </Sheet>
  );
}

const EMPTY: BillInput = { finalAmount: "", reason: "", cash: "" };

function BillForm({ screen, onSettled, onClose }: Omit<Props, "open">) {
  // Visual-only state: what has been typed, and which parts are showing.
  const [input, setInput] = useState<BillInput>(EMPTY);
  const [adjusting, setAdjusting] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [failure, setFailure] = useState<string>();
  const settling = useRef(false);

  const quote = screen.quote(input);
  const { subtotal, due, discount } = quote;
  const amountError = !discount.ok && discount.error !== "tooLong" ? AMOUNT_ERRORS[discount.error](subtotal) : undefined;
  const reasonError = !discount.ok && discount.error === "tooLong" ? "Keep it short." : undefined;
  const edit = (patch: Partial<BillInput>) => setInput((current) => ({ ...current, ...patch }));

  async function settle(by: PayBy) {
    if (settling.current) return;
    settling.current = true;
    try {
      setFailure(undefined);
      const result = await screen.settle(input, by);
      if (result.ok) return onSettled(due, result.value);
      // Already settled: a repeated tap, or another tab got there first.
      if (result.error === "settled" || result.error === "empty") return onClose();
      if (result.error === "notExact" || result.error === "unsent") {
        setFailure("This bill just changed on another screen. Check the total and try again.");
      }
    } catch {
      setFailure("Couldn't save on this device. Try again.");
    } finally {
      settling.current = false;
    }
  }

  const dishes = dishCount(screen.ticket.rounds.flatMap((r) => r.lines));

  return (
    <div className="space-y-6">
      <section className="pt-2 text-center">
        <p className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{formatPrice(due)}</p>
        <p className="mt-2 text-[15px] text-muted">
          {discount.ok && discount.value ? (
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
            placeholder={formatPrice(subtotal).replace("₹", "")}
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

      {failure && <p className="rounded-xl bg-primary/12 px-4 py-3 text-[15px] font-medium text-primary">{failure}</p>}

      {due === 0 ? (
        <Button className="w-full" disabled={!discount.ok} onClick={() => settle("cash")}>
          Close bill
        </Button>
      ) : splitting ? (
        <Split screen={screen} input={input} edit={edit} onSettle={() => settle("split")} onCancel={() => setSplitting(false)} />
      ) : (
        <>
          <Change tender={quote.tender} given={input.given} change={quote.change} onGiven={(given) => edit({ given })} />
          <div className="grid grid-cols-2 gap-3">
            <PayTile icon={<MdPayments />} label="Cash" disabled={!discount.ok} onClick={() => settle("cash")} />
            <PayTile icon={<MdQrCode2 />} label="UPI" disabled={!discount.ok} onClick={() => settle("upi")} />
          </div>
          <Button variant="plain" className="w-full" disabled={!discount.ok} onClick={() => setSplitting(true)}>
            <MdCallSplit aria-hidden className="text-xl" /> Part cash, part UPI
          </Button>
        </>
      )}
    </div>
  );
}

const AMOUNT_ERRORS = {
  invalid: () => "Type an amount, like 850.",
  upward: (subtotal: Paise) => `Can't be more than ${formatPrice(subtotal)}. Add a dish instead.`,
};

function PayTile({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button variant="secondary" className="min-h-20 flex-col gap-1 rounded-2xl" disabled={disabled} onClick={onClick}>
      <span aria-hidden className="text-[28px] text-primary">
        {icon}
      </span>
      {label}
    </Button>
  );
}

// Optional: tap the note the guest handed over to see the change. Nothing
// here commits; Cash does.
function Change({
  tender,
  given,
  change,
  onGiven,
}: {
  tender: Paise[];
  given?: Paise;
  change?: Paise;
  onGiven: (given: Paise | undefined) => void;
}) {
  return (
    <section aria-label="Cash given" className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 px-1 text-[13px] font-semibold text-muted">Cash given</span>
        <div className="flex flex-1 justify-end gap-2">
          {tender.map((amount) => (
            <button
              key={amount}
              type="button"
              aria-pressed={given === amount}
              onClick={() => onGiven(given === amount ? undefined : amount)}
              className={`min-h-11 rounded-full px-3.5 text-[15px] font-semibold tabular-nums transition-colors ${
                given === amount ? "bg-ink text-bg" : "bg-surface text-ink"
              }`}
            >
              {formatPrice(amount)}
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="min-h-7 px-1 text-right text-[20px] font-bold text-success tabular-nums">
        {change !== undefined && (change === 0 ? "No change" : `Change ${formatPrice(change)}`)}
      </p>
    </section>
  );
}

function Split({
  screen,
  input,
  edit,
  onSettle,
  onCancel,
}: {
  screen: ReadyOrder;
  input: BillInput;
  edit: (patch: Partial<BillInput>) => void;
  onSettle: () => void;
  onCancel: () => void;
}) {
  const { due, split, discount } = screen.quote(input);
  const upi = split.ok ? (split.value.find((p) => p.method === "upi")?.amount ?? 0) : undefined;
  const error =
    !split.ok && split.error === "invalid"
      ? "Type an amount, like 500."
      : !split.ok && split.error === "moreThanDue"
        ? `Can't be more than ${formatPrice(due)}.`
        : undefined;

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-2xl bg-surface px-4 py-3">
        <TextField
          label="Cash"
          prefix="₹"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          inset
          value={input.cash}
          error={error}
          onChange={(e) => edit({ cash: e.target.value })}
        />
        <div className="flex min-h-11 items-center justify-between px-1 text-[17px]">
          <span className="text-muted">UPI, the rest</span>
          <span className="font-semibold tabular-nums">{upi === undefined ? "—" : formatPrice(upi as Paise)}</span>
        </div>
      </div>
      <Button className="w-full" disabled={!split.ok || !discount.ok} onClick={onSettle}>
        Settle {formatPrice(due)}
      </Button>
      <Button variant="plain" className="w-full" onClick={onCancel}>
        Pay all at once
      </Button>
    </div>
  );
}
