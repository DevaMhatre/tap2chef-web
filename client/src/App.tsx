import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { PortsProvider } from "./usecases/PortsProvider";
import { ShopProvider } from "./usecases/ShopProvider";
import { useShowsTables } from "./usecases/useRestaurant";
import type { Ports } from "./usecases/ports";
import { dexieMenuRepository } from "./infrastructure/db/dexieMenuRepository";
import { dexieDayRepository } from "./infrastructure/db/dexieDayRepository";
import { dexieDrawerRepository } from "./infrastructure/db/dexieDrawerRepository";
import { dexieExpenseRepository } from "./infrastructure/db/dexieExpenseRepository";
import { dexieOrderRepository } from "./infrastructure/db/dexieOrderRepository";
import { dexieSetupStore } from "./infrastructure/db/dexieSetupStore";
import { dexieShopRepository } from "./infrastructure/db/dexieShopRepository";
import { httpAccountService } from "./infrastructure/account/httpAccountService";
import { newId } from "./infrastructure/id";
import { browserNetworkStatus, browserVisibility } from "./infrastructure/network";
import { httpSync } from "./infrastructure/sync/httpSync";
import AppShell from "./ui/AppShell";
import { SetupGate } from "./ui/features/setup/SetupGate";
import { CompletionProvider } from "./ui/design-system/Completion";
import { UndoToastProvider } from "./ui/design-system/UndoToast";
import ExpensesPage from "./ui/pages/ExpensesPage";
import MenuPage from "./ui/pages/MenuPage";
import OrderPage from "./ui/pages/OrderPage";
import OrdersPage from "./ui/pages/OrdersPage";
import SettledPage from "./ui/pages/SettledPage";
import TablesPage from "./ui/pages/TablesPage";
import Today from "./ui/pages/Today";

// Composition root: the only place that knows which infrastructure backs
// each port.
const ports: Ports = {
  sync: httpSync,
  network: browserNetworkStatus,
  visibility: browserVisibility,
  menu: dexieMenuRepository,
  orders: dexieOrderRepository,
  expenses: dexieExpenseRepository,
  days: dexieDayRepository,
  drawer: dexieDrawerRepository,
  account: httpAccountService,
  shop: dexieShopRepository,
  setup: dexieSetupStore,
  ids: { newId },
  clock: { now: Date.now },
};

export default function App() {
  return (
    <PortsProvider ports={ports}>
      <ShopProvider>
      <UndoToastProvider>
        <CompletionProvider>
        <BrowserRouter>
          <SetupGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="tables" element={<NoTables fallback={<TablesPage />} />} />
              <Route path="tables/:tableId" element={<OrderPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/settled" element={<SettledPage />} />
              <Route path="orders/:orderId" element={<OrderPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="today" element={<Today />} />
              <Route path="*" element={<Home />} />
            </Route>
          </Routes>
          </SetupGate>
        </BrowserRouter>
        </CompletionProvider>
      </UndoToastProvider>
      </ShopProvider>
    </PortsProvider>
  );
}

// Home is where the service happens: the floor, or for a kitchen with no
// tables, its orders.
function Home() {
  return <Navigate to={useShowsTables() === false ? "/orders" : "/tables"} replace />;
}

/** A kitchen with no tables never lands on an empty floor, whatever link it followed. */
function NoTables({ fallback }: { fallback: ReactNode }) {
  return useShowsTables() === false ? <Navigate to="/orders" replace /> : fallback;
}
