import type { Paise } from "../../../domain/money";
import type { OrderLine } from "../../../domain/order";
import { lineTotal } from "../../../domain/order";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { MdPrint } from "react-icons/md";
import { Button } from "../../design-system/Button";
import { DietMark } from "../../design-system/DietMark";
import { ListSection } from "../../design-system/GroupedList";
import { Stepper } from "../../design-system/Stepper";
import { formatPrice, formatTime } from "../../format";
import type { KotStatus } from "../../../domain/kot";
import { DishLabel } from "./DishLabel";
import { dishName, voidReasonLabel } from "./labels";

type Props = {
  screen: ReadyOrder;
  onStep: (line: OrderLine, by: 1 | -1) => void;
  /** A tap on a line still in the cart: its note, or removing it. */
  onEditDraft: (line: OrderLine) => void;
  /** A tap on a sent line: cancelling it. */
  onVoid: (line: OrderLine) => void;
};

// The order as the kitchen got it, round by round, then what is still in the
// cart, right above Send.
export function Ticket({ screen, onStep, onEditDraft, onVoid }: Props) {
  const { rounds, draft, total } = screen.ticket;
  const { bill } = screen;

  if (rounds.length === 0 && draft.length === 0) {
    return <p className="rounded-2xl bg-surface px-4 py-6 text-center text-[15px] text-muted">Tap a dish to add it.</p>;
  }

  return (
    <div className="space-y-5">
      {rounds.map((round, i) => (
        <ListSection
          key={round.id}
          header={<RoundHeader round={round} status={screen.kotStatus(round)} />}
          headerAction={
            screen.canPrint(round) && (
              <Button variant="plain" size="compact" className="-mr-3" aria-label={`Print round ${round.number} for the kitchen`} onClick={() => void screen.printRound(round.id)}>
                <MdPrint aria-hidden className="text-lg" />
                Print
              </Button>
            )
          }
          // Offline, it says what to do; otherwise said once, under the latest round:
          // nothing else hints that a sent dish can be cancelled.
          footer={
            screen.kotStatus(round).kind === "offline" ? (
              <span className="font-medium text-warning">This phone has no internet, so the kitchen printer hasn&rsquo;t got this round. Tell the kitchen.</span>
            ) : i === rounds.length - 1 ? (
              "Tap a sent dish to cancel it."
            ) : undefined
          }
        >
          {round.lines.map((line) => (
            <SentLine key={line.id} line={line} onVoid={onVoid} />
          ))}
        </ListSection>
      ))}

      {draft.length > 0 && (
        <ListSection header={rounds.length > 0 ? "Adding · not sent" : "Not sent"}>
          {draft.map((line) => (
            <div key={line.id} className="flex items-center gap-2 py-1.5 pr-2 pl-4">
              <button type="button" onClick={() => onEditDraft(line)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                <DietMark diet={line.diet} decorative />
                <span className="min-w-0">
                  <DishLabel line={line} className="text-[17px]" />
                  <span className="block truncate text-[13px] text-muted">
                    <span className="tabular-nums">{formatPrice(lineTotal(line))}</span> ·{" "}
                    {line.note ? line.note : <span className="text-primary">Add note</span>}
                  </span>
                </span>
              </button>
              <Stepper value={line.quantity} label={dishName(line)} removable onStep={(by) => onStep(line, by)} />
            </div>
          ))}
        </ListSection>
      )}

      <div className="space-y-1 px-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] font-semibold">Total</span>
          <span className="text-[28px] font-bold tracking-tight tabular-nums">{formatPrice(total)}</span>
        </div>
        {/* Once the bill is out, what the guest still owes, not only what the dishes came to. */}
        {bill.discount && (
          <div className="flex justify-between text-[15px] text-muted">
            <span>Discount{bill.discount.reason && ` · ${bill.discount.reason}`}</span>
            <span className="tabular-nums">−{formatPrice(bill.discount.amount)}</span>
          </div>
        )}
        {bill.paid > 0 && (
          <div className="flex justify-between text-[15px] text-muted">
            <span>Paid</span>
            <span className="tabular-nums">−{formatPrice(bill.paid)}</span>
          </div>
        )}
        {(bill.discount || bill.paid > 0) && (
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[17px] font-semibold">To pay</span>
            <span className="text-[20px] font-bold tabular-nums">{formatPrice(Math.max(0, bill.remaining) as Paise)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SentLine({ line, onVoid }: { line: OrderLine; onVoid: (line: OrderLine) => void }) {
  if (line.state.status === "voided") {
    const { reason, by } = line.state;
    return (
      <div className="flex min-h-11 items-center gap-3 px-4 py-3 text-muted">
        <span className="w-7 shrink-0 text-[15px] tabular-nums">{line.quantity}×</span>
        <span className="min-w-0 flex-1">
          <DishLabel line={line} className="text-[17px] line-through" />
          <span className="block truncate text-[13px]">
            Cancelled{reason ? ` · ${voidReasonLabel(reason)}` : ""}
            {by ? ` · by ${by}` : ""}
          </span>
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onVoid(line)}
      aria-label={`${line.quantity} ${dishName(line)}, sent. Cancel…`}
      className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2"
    >
      <span className="w-7 shrink-0 text-[15px] text-muted tabular-nums">{line.quantity}×</span>
      <span className="min-w-0 flex-1">
        <DishLabel line={line} className="text-[17px]" />
        {line.note && <span className="block truncate text-[13px] text-muted">{line.note}</span>}
      </span>
      <span className="shrink-0 text-[15px] tabular-nums">{formatPrice(lineTotal(line))}</span>
    </button>
  );
}

// Once printed, the KOT number the kitchen's slip says. Offline, a waiter's
// round can't reach the kitchen printer: it says so, and what to do is said
// under the round, where there is room on a phone.
function RoundHeader({ round, status }: { round: { number: number; sentAt: number }; status: KotStatus }) {
  const time = formatTime(round.sentAt);
  if (status.kind === "printed") return <>{`KOT ${status.number} · ${time}`}</>;
  if (status.kind === "offline") return <span className="text-warning">Not sent to the kitchen</span>;
  return <>{`Round ${round.number} · ${time}`}</>;
}
