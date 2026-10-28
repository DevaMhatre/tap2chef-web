import { MdExpandLess } from "react-icons/md";
import { dishCount } from "../../../domain/order";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { formatPrice } from "../../format";

type Props = { screen: ReadyOrder; onOpen: () => void; onSend: () => void };

// Phones and tablets in portrait: the order lives in a bar under the thumb. Send is on the bar itself,
// so table → dish → Send is three taps.
export function CartBar({ screen, onOpen, onSend }: Props) {
  const { draft, rounds, total } = screen.ticket;
  if (draft.length === 0 && rounds.length === 0) return null;
  const unsent = dishCount(draft);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:left-60 lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left">
          <MdExpandLess aria-hidden className="shrink-0 text-2xl text-muted" />
          <span className="min-w-0">
            <span className="block text-[17px] font-bold tabular-nums">{formatPrice(total)}</span>
            <span className="block truncate text-[13px] text-muted">
              {unsent > 0 ? `${unsent} not sent` : `${rounds.length} ${rounds.length === 1 ? "round" : "rounds"} sent`} · View order
            </span>
          </span>
        </button>
        {unsent > 0 && (
          <Button className="min-h-12 px-6" onClick={onSend}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
