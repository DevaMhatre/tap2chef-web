import { createContext, useContext, type ReactNode } from "react";
import { useKitchenPrinting, type KitchenPrinting } from "./useKitchenPrinting";

const KitchenPrintingContext = createContext<KitchenPrinting | null>(null);

/**
 * Runs the kitchen printing once for the whole app, above every screen: two
 * copies would both print, and a screen change must never stop a slip.
 */
export function KitchenPrintingProvider({ children }: { children: ReactNode }) {
  const printing = useKitchenPrinting();
  return <KitchenPrintingContext.Provider value={printing}>{children}</KitchenPrintingContext.Provider>;
}

export function useKitchenPrinter(): KitchenPrinting {
  const printing = useContext(KitchenPrintingContext);
  if (!printing) throw new Error("useKitchenPrinter outside KitchenPrintingProvider");
  return printing;
}
