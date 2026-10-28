import { useState, type ReactNode } from "react";
import { MdChevronLeft, MdMenuBook } from "react-icons/md";
import { Link, useNavigate, useParams } from "react-router";
import type { Paise } from "../../domain/money";
import type { OrderId, OrderLine } from "../../domain/order";
import type { TableId } from "../../domain/tables";
import type { Undo } from "../../usecases/orderDesk";
import { useOrder, type OrderTarget, type ReadyOrder } from "../../usecases/useOrder";
import { Button } from "../design-system/Button";
import { haptic } from "../design-system/haptic";
import { SegmentedControl } from "../design-system/SegmentedControl";
import { Sheet } from "../design-system/Sheet";
import { useUndoToast } from "../design-system/UndoToast";
import { BillSheet } from "../features/order/BillSheet";
import { CartBar } from "../features/order/CartBar";
import { orderTitle, shortOrderTitle } from "../features/order/labels";
import { formatPrice } from "../format";
import { LineSheet } from "../features/order/LineSheet";
import { MenuPicker } from "../features/order/MenuPicker";
import { MoveSheet } from "../features/order/MoveSheet";
import { OutTodaySheet } from "../features/order/OutTodaySheet";
import { Ticket } from "../features/order/Ticket";
import { VoidSheet } from "../features/order/VoidSheet";

export default function OrderPage() {
  const { tableId, orderId } = useParams();
  const target: OrderTarget = tableId
    ? { kind: "table", tableId: tableId as TableId }
    : { kind: "takeaway", orderId: orderId as OrderId };
  // A new screen per table or order, so nothing typed carries across.
  return <OrderScreen key={tableId ?? orderId} target={target} />;
}

// Visual-only state: which sheet is open.
type OpenSheet =
  | { kind: "ticket" }
  | { kind: "bill" }
  | { kind: "line"; line: OrderLine }
  | { kind: "void"; line: OrderLine }
  | { kind: "move" }
  | { kind: "outToday" }
  | null;

function OrderScreen({ target }: { target: OrderTarget }) {
  const screen = useOrder(target);
  const navigate = useNavigate();
  const back = target.kind === "table" ? { to: "/tables", label: "Tables" } : { to: "/orders", label: "Orders" };

  if (screen.state === "loading") return <NavBar back={back} title="" />;
  if (screen.state === "missing") {
    return (
      <Empty back={back} title="This table was removed">
        <Button onClick={() => navigate(back.to)}>Back to Tables</Button>
      </Empty>
    );
  }
  if (screen.state === "noMenu") {
    return (
      <Empty back={back} title="Add your dishes first">
        <Link to="/menu" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-[17px] font-semibold text-white">
          <MdMenuBook /> Open Menu
        </Link>
      </Empty>
    );
  }
  if (screen.state === "settled") {
    return (
      <Empty back={back} title={`${shortOrderTitle(screen.label)} is paid`}>
        <p className="-mt-2 text-[17px] text-muted tabular-nums">{formatPrice(screen.paid)}</p>
        <Button onClick={() => navigate(back.to)}>Back to {back.label}</Button>
      </Empty>
    );
  }
  return <ReadyScreen screen={screen} back={back} />;
}

function ReadyScreen({ screen, back }: { screen: ReadyOrder; back: { to: string; label: string } }) {
  const navigate = useNavigate();
  const showUndo = useUndoToast();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [failure, setFailure] = useState<string>();
  const close = () => setSheet(null);
  const outCount = screen.dishes.filter((d) => d.out).length;
  const stored = screen.ticket.rounds.length > 0 || screen.ticket.draft.length > 0;

  // Every write is local; a failure means the device's storage refused it.
  async function attempt<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      setFailure(undefined);
      return await action();
    } catch {
      setFailure("Couldn't save on this device. Try again.");
      return undefined;
    }
  }

  const add = (dish: Parameters<ReadyOrder["addDish"]>[0]) =>
    attempt(async () => {
      const result = await screen.addDish(dish);
      if (result.ok) haptic();
    });

  const step = (line: OrderLine, by: 1 | -1) =>
    attempt(async () => {
      const result = await screen.stepQuantity(line.id, by);
      if (result.ok && result.value) showUndo(`Removed ${line.name}`, result.value);
    });

  // Sent: the job here is done. Back to the floor, where the table's tile
  // now shows the round.
  const send = () =>
    attempt(async () => {
      const sent = await screen.send();
      if (sent === 0) return;
      haptic();
      navigate(back.to);
    });

  // Paid: back to the floor, where the table is free again. Undo stays on
  // screen there for a few seconds.
  const settled = (paid: Paise, undo: Undo) => {
    haptic();
    close();
    navigate(back.to);
    showUndo(`${orderTitle(screen.label)} paid · ${formatPrice(paid)}`, undo);
  };
  const openBill = () => setSheet({ kind: "bill" });

  const ticket = (
    <Ticket
      screen={screen}
      onStep={step}
      onEditDraft={(line) => setSheet({ kind: "line", line })}
      onVoid={(line) => setSheet({ kind: "void", line })}
    />
  );
  const canMove = screen.order.channel.type === "dineIn" && stored;

  return (
    <div className="mx-auto max-w-6xl">
      <NavBar
        back={back}
        title={orderTitle(screen.label)}
        subtitle={screen.profileChoice || screen.profileName === "" ? undefined : `${screen.profileName} prices`}
        action={
          canMove && (
            <Button variant="plain" size="compact" className="-mr-3" onClick={() => setSheet({ kind: "move" })}>
              Move
            </Button>
          )
        }
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          {failure && <p className="mb-3 rounded-xl bg-primary/12 px-4 py-3 text-[15px] font-medium text-primary">{failure}</p>}
          <MenuPicker
            screen={screen}
            onAdd={add}
            accessory={
              <Button variant="secondary" className="shrink-0 px-4 text-[15px]" onClick={() => setSheet({ kind: "outToday" })}>
                {outCount > 0 ? `${outCount} out` : "Out today"}
              </Button>
            }
          >
            {screen.profileChoice && screen.profileChoice.profiles.length <= 3 && (
              <SegmentedControl
                label="Price list"
                options={screen.profileChoice.profiles.map((p) => ({ value: p.id, label: p.name }))}
                value={screen.profileChoice.chosen}
                onChange={screen.chooseProfile}
              />
            )}
            {screen.profileChoice && screen.profileChoice.profiles.length > 3 && (
              <select
                aria-label="Price list"
                value={screen.profileChoice.chosen}
                onChange={(e) => screen.chooseProfile(e.target.value as typeof screen.order.profileId)}
                className="min-h-11 w-full appearance-none rounded-xl bg-surface px-3 text-[17px] text-ink outline-none"
              >
                {screen.profileChoice.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} prices
                  </option>
                ))}
              </select>
            )}
          </MenuPicker>
        </div>

        {/* Wide screens: the order beside the menu, Send under it. Narrower
            ones keep the menu full width and the order in the cart bar. */}
        <aside aria-label="Order" className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] space-y-4 overflow-y-auto overscroll-contain pb-2 lg:block">
          {ticket}
          {screen.ticket.draft.length > 0 && (
            <Button className="w-full" onClick={send}>
              Send to Kitchen
            </Button>
          )}
          {screen.canSettle && (
            <Button className="w-full" onClick={openBill}>
              Settle {formatPrice(screen.ticket.total)}
            </Button>
          )}
        </aside>
      </div>

      {/* Room for the cart bar, so it never covers the last dish. */}
      <div aria-hidden className="h-20 lg:hidden" />
      <CartBar screen={screen} onOpen={() => setSheet({ kind: "ticket" })} onSend={send} onSettle={openBill} />

      <Sheet
        open={sheet?.kind === "ticket"}
        onClose={close}
        title={orderTitle(screen.label)}
        dismissLabel={screen.canSettle ? "Close" : null}
        action={
          screen.canSettle ? (
            // Hands over to the bill sheet in the same place.
            <Button size="compact" onClick={openBill}>
              Settle
            </Button>
          ) : screen.ticket.draft.length > 0 ? (
            <Button
              size="compact"
              onClick={() => {
                close();
                void send();
              }}
            >
              Send
            </Button>
          ) : (
            <Button size="compact" variant="tinted" onClick={close}>
              Done
            </Button>
          )
        }
      >
        {ticket}
      </Sheet>
      {/* Line sheets open over the ticket sheet's place, never on top of it. */}
      <LineSheet line={sheet?.kind === "line" ? sheet.line : null} screen={screen} onClose={close} />
      <VoidSheet line={sheet?.kind === "void" ? sheet.line : null} screen={screen} onClose={close} />
      <MoveSheet
        open={sheet?.kind === "move"}
        screen={screen}
        onClose={close}
        onMoved={(tableId) => {
          haptic();
          close();
          navigate(`/tables/${tableId}`, { replace: true });
        }}
      />
      <BillSheet open={sheet?.kind === "bill"} screen={screen} onClose={close} onSettled={settled} />
      <OutTodaySheet open={sheet?.kind === "outToday"} screen={screen} onClose={close} />
    </div>
  );
}

// A pushed screen's own bar: back to where it came from, the order's name.
function NavBar({
  back,
  title,
  subtitle,
  action,
}: {
  back: { to: string; label: string };
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-bg/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:-mx-6 md:px-4">
      <Link to={back.to} className="-ml-1 flex min-h-11 items-center justify-self-start pr-2 text-[17px] text-primary">
        <MdChevronLeft aria-hidden className="text-3xl" />
        {back.label}
      </Link>
      <div className="min-w-0 text-center">
        <h1 className="truncate text-[17px] font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      <div className="justify-self-end">{action}</div>
    </header>
  );
}

function Empty({ back, title, children }: { back: { to: string; label: string }; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <NavBar back={back} title="" />
      <section className="mx-auto flex min-h-[50dvh] max-w-sm flex-col items-center justify-center gap-5 text-center">
        <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
        {children}
      </section>
    </div>
  );
}
