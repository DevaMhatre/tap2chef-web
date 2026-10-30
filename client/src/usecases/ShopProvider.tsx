import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ShopDetails } from "../domain/setup";
import { usePorts } from "./PortsProvider";

// The shop's details shape the whole app (its name, whether it has tables),
// so they are read once, above every screen: every reader sees the same
// value from its first frame, and nothing draws twice.
const ShopContext = createContext<ShopDetails | null | undefined>(undefined);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { shop } = usePorts();
  const [details, setDetails] = useState<ShopDetails | null>();
  useEffect(() => shop.subscribe(setDetails), [shop]);
  return <ShopContext.Provider value={details}>{children}</ShopContext.Provider>;
}

/** The restaurant as its owner described it: undefined while reading, null before setup. */
export const useShopDetails = (): ShopDetails | null | undefined => useContext(ShopContext);
