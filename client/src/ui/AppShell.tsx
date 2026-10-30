import { useState } from "react";
import { NavLink, Outlet, useMatch } from "react-router";
import type { IconType } from "react-icons";
import {
  MdTableRestaurant,
  MdReceiptLong,
  MdMenuBook,
  MdPayments,
  MdInsights,
  MdCheckCircle,
  MdCloudDone,
  MdExpandMore,
} from "react-icons/md";
import { useRestaurantName, useShowsTables } from "../usecases/useRestaurant";
import { useDeviceSession } from "../usecases/useSignIn";
import { useSync } from "../usecases/useSync";
import { AccountSheet } from "./features/account/AccountSheet";
import type { Phone } from "../domain/phones";
import { useRemovePhone } from "../usecases/usePhones";
import { AddPhoneSheet } from "./features/restaurant/AddPhoneSheet";
import { RemovePhoneSheet } from "./features/restaurant/RemovePhoneSheet";
import { RestaurantSheet } from "./features/restaurant/RestaurantSheet";
import { SafeCopyCard } from "./features/setup/SafeCopyCard";

const NAV: { to: string; label: string; icon: IconType }[] = [
  { to: "/tables", label: "Tables", icon: MdTableRestaurant },
  { to: "/orders", label: "Orders", icon: MdReceiptLong },
  { to: "/menu", label: "Menu", icon: MdMenuBook },
  { to: "/expenses", label: "Expenses", icon: MdPayments },
  { to: "/today", label: "Today", icon: MdInsights },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
    isActive ? "bg-primary text-white" : "text-muted hover:bg-surface-2"
  }`;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
    isActive ? "text-primary" : "text-muted"
  }`;

// Where the work is kept, and nothing more: "on this device" until it has
// reached the account, then "online". No count of waiting changes and no
// "Offline" warning: the app works the same either way, and a number that
// grows while the internet is down reads as a fault. The badge is also the
// door to the account, since that is what it talks about.
function SavedBadge() {
  const session = useDeviceSession();
  const kept = useSync(Boolean(session));
  const [open, setOpen] = useState(false);
  const Icon = kept === "online" ? MdCloudDone : MdCheckCircle;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group -my-1.5 inline-flex min-h-11 shrink-0 items-center">
        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success transition-transform group-active:scale-[0.96]">
          <Icon className="text-sm" aria-hidden />
          {kept === "online" ? "Saved online" : "Saved on this device"}
        </span>
      </button>
      <AccountSheet open={open} session={session} kept={kept} onClose={() => setOpen(false)} />
    </>
  );
}

// The restaurant's name is the owner's door to what they told the setup. The
// chevron says it opens something, as a title menu does.
function RestaurantDoor({ name, className }: { name: string; className: string }) {
  // One sheet at a time: adding or removing a phone takes the restaurant
  // sheet's place, and removing comes back to it.
  const [sheet, setSheet] = useState<{ kind: "restaurant" } | { kind: "add" } | { kind: "remove"; phone: Phone }>();
  const remove = useRemovePhone();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setSheet({ kind: "restaurant" })}
        className={`group -my-1.5 flex min-h-11 min-w-0 items-center gap-0.5 text-left ${className}`}
      >
        <span className="min-w-0 truncate font-extrabold tracking-tight transition-opacity group-active:opacity-60">{name}</span>
        <MdExpandMore aria-hidden className="shrink-0 text-xl text-muted" />
      </button>
      <RestaurantSheet
        open={sheet?.kind === "restaurant"}
        onClose={() => setSheet(undefined)}
        onAddPhone={() => setSheet({ kind: "add" })}
        onRemovePhone={(phone) => setSheet({ kind: "remove", phone })}
      />
      <AddPhoneSheet open={sheet?.kind === "add"} restaurantName={name} onClose={() => setSheet(undefined)} />
      <RemovePhoneSheet
        phone={sheet?.kind === "remove" ? sheet.phone : undefined}
        restaurantName={name}
        onRemove={remove}
        onClose={() => setSheet(sheet?.kind === "remove" ? { kind: "restaurant" } : undefined)}
      />
    </>
  );
}

export default function AppShell() {
  // An open order is a pushed screen: it brings its own bar, and on a phone
  // its cart takes the tab bar's place under the thumb.
  const atTable = useMatch("/tables/:tableId");
  const atOrder = useMatch("/orders/:orderId");
  const pushed = Boolean(atTable || atOrder);
  // The service screens, where the owner starts every day.
  const atFloor = useMatch("/tables");
  const atOrders = useMatch("/orders");
  const atService = Boolean(atFloor || atOrders);
  // The restaurant's own name: it is their app.
  const name = useRestaurantName() ?? "Tap2Chef";
  // A kitchen whose customers only take food away has no floor to show.
  const tables = useShowsTables() !== false;
  const nav = tables ? NAV : NAV.filter(({ to }) => to !== "/tables");

  return (
    <div className="min-h-dvh bg-bg text-ink md:flex">
      {/* Sidebar: tablet and desktop */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface p-4 md:flex">
        <RestaurantDoor name={name} className="mb-4 px-3 text-xl" />
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon className="text-lg" />
            {label}
          </NavLink>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-pushed={pushed} className="sticky top-0 z-10 flex data-[pushed=true]:hidden items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <RestaurantDoor name={name} className="text-lg md:invisible" />
          <SavedBadge />
        </header>

        {/* Bottom padding leaves room for the phone tab bar */}
        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
          {atService && <SafeCopyCard />}
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar: phones */}
      <nav data-pushed={pushed} className="fixed inset-x-0 bottom-0 z-10 flex data-[pushed=true]:hidden border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={tabClass}>
            <Icon className="text-2xl" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
