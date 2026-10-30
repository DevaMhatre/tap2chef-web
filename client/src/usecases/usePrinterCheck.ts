import { useRef, useState } from "react";
import type { PrinterRoute, PrinterTry } from "./ports";
import { usePorts } from "./PortsProvider";

export type PrinterCheckState = {
  results: Partial<Record<PrinterRoute, PrinterTry>>;
  /** The route being tried now, if any: one at a time. */
  trying?: PrinterRoute;
  tryRoute(route: PrinterRoute): Promise<void>;
};

/** Finding out, next to a real printer, which way Tap2Chef can reach it. */
export function usePrinterCheck(): PrinterCheckState {
  const { printer } = usePorts();
  const [results, setResults] = useState<PrinterCheckState["results"]>({});
  const [trying, setTrying] = useState<PrinterRoute>();
  // The browser's printer picker opens once per tap, however fast the taps.
  const busy = useRef(false);

  return {
    results,
    trying,
    async tryRoute(route) {
      if (busy.current) return;
      busy.current = true;
      setTrying(route);
      try {
        const result = await printer.tryPrint(route).catch((error: unknown): PrinterTry => ({ outcome: "failed", detail: String(error) }));
        setResults((r) => ({ ...r, [route]: result }));
      } finally {
        busy.current = false;
        setTrying(undefined);
      }
    },
  };
}
