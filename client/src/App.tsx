import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { PortsProvider } from "./usecases/PortsProvider";
import type { Ports } from "./usecases/ports";
import { dexieMenuRepository } from "./infrastructure/db/dexieMenuRepository";
import { dexieOrderRepository } from "./infrastructure/db/dexieOrderRepository";
import { dexieSyncRepository } from "./infrastructure/db/dexieSyncRepository";
import { newId } from "./infrastructure/id";
import { browserNetworkStatus } from "./infrastructure/network";
import AppShell from "./ui/AppShell";
import { UndoToastProvider } from "./ui/design-system/UndoToast";
import ComingSoon from "./ui/pages/ComingSoon";
import MenuPage from "./ui/pages/MenuPage";
import Today from "./ui/pages/Today";

// Composition root: the only place that knows which infrastructure backs
// each port.
const ports: Ports = {
  sync: dexieSyncRepository,
  network: browserNetworkStatus,
  menu: dexieMenuRepository,
  orders: dexieOrderRepository,
  ids: { newId },
  clock: { now: Date.now },
};

export default function App() {
  return (
    <PortsProvider ports={ports}>
      <UndoToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/tables" replace />} />
              <Route
                path="tables"
                element={<ComingSoon title="Tables">Dine-in table grid comes next.</ComingSoon>}
              />
              <Route
                path="orders"
                element={<ComingSoon title="Orders">Kitchen queue: cooking → served → settled.</ComingSoon>}
              />
              <Route path="menu" element={<MenuPage />} />
              <Route
                path="expenses"
                element={<ComingSoon title="Expenses">Daily expenses paid by cash or UPI.</ComingSoon>}
              />
              <Route path="today" element={<Today />} />
              <Route path="*" element={<Navigate to="/tables" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </UndoToastProvider>
    </PortsProvider>
  );
}
