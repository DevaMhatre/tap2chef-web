import { MdShoppingBag, MdTableRestaurant } from "react-icons/md";
import type { OrderChannel } from "../../../domain/order";

/** A row's leading mark: a table or a takeaway bag. */
export function OrderIcon({ channel }: { channel: OrderChannel }) {
  const Icon = channel.type === "takeaway" ? MdShoppingBag : MdTableRestaurant;
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl text-muted">
      <Icon />
    </span>
  );
}
