import { NavLink, Outlet, useMatch } from "react-router";
import type { IconType } from "react-icons";
import {
  MdTableRestaurant,
  MdReceiptLong,
  MdMenuBook,
  MdPayments,
  MdInsights,
  MdCheckCircle,
} from "react-icons/md";

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

// Sync doesn't exist yet, so an "unsynced" count would only ever grow and an
// "Offline" warning would warn about nothing — the app works the same either
// way. Until sync lands, say the one thing that's true: the work is safe here.
// useSyncStatus is kept for when there is something to report.
function SavedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
      <MdCheckCircle className="text-sm" aria-hidden />
      Saved on this device
    </span>
  );
}

export default function AppShell() {
  // An open order is a pushed screen: it brings its own bar, and on a phone
  // its cart takes the tab bar's place under the thumb.
  const atTable = useMatch("/tables/:tableId");
  const atOrder = useMatch("/orders/:orderId");
  const pushed = Boolean(atTable || atOrder);

  return (
    <div className="min-h-dvh bg-bg text-ink md:flex">
      {/* Sidebar: tablet and desktop */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 px-3 text-xl font-extrabold tracking-tight">Tap2Chef</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon className="text-lg" />
            {label}
          </NavLink>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-pushed={pushed} className="sticky top-0 z-10 flex data-[pushed=true]:hidden items-center justify-between border-b border-line bg-surface/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <span className="text-lg font-extrabold tracking-tight md:invisible">Tap2Chef</span>
          <SavedBadge />
        </header>

        {/* Bottom padding leaves room for the phone tab bar */}
        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar: phones */}
      <nav data-pushed={pushed} className="fixed inset-x-0 bottom-0 z-10 flex data-[pushed=true]:hidden border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={tabClass}>
            <Icon className="text-2xl" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
