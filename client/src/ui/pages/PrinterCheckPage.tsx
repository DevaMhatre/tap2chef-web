import { useNavigate } from "react-router";
import { MdCheckCircle, MdPrint } from "react-icons/md";
import type { PrinterRoute, PrinterTry } from "../../usecases/ports";
import { usePrinterCheck } from "../../usecases/usePrinterCheck";
import { Button } from "../design-system/Button";
import { ListSection } from "../design-system/GroupedList";
import { Screen } from "../features/setup/SetupFlow";

const ROUTES: { route: PrinterRoute; title: string; how: string }[] = [
  { route: "bluetooth", title: "Bluetooth", how: "Printer on, close to this phone. Tap, then pick it from the list." },
  { route: "usb", title: "USB Cable", how: "Printer joined to this phone with an OTG cable. Tap, then pick it." },
];

function said(result: PrinterTry | undefined): { line: string; good?: boolean } | undefined {
  if (!result) return undefined;
  switch (result.outcome) {
    case "unsupported":
      return { line: "This browser can’t do this. Open the page in Chrome on an Android phone." };
    case "cancelled":
      return { line: "Nothing picked. If the printer wasn’t in the list, this way can’t reach it." };
    case "printed":
      return { line: `Printed on ${result.name}. Check the paper.`, good: true };
    case "failed":
      return { line: `${result.name ? `${result.name}: ` : ""}didn’t print.` };
  }
}

// For us, beside a real printer: which way can Tap2Chef reach it? Each try
// prints a test KOT. A screenshot of this page is the whole answer.
export default function PrinterCheckPage() {
  const check = usePrinterCheck();
  const navigate = useNavigate();
  return (
    <Screen back={() => navigate("/", { replace: true })} icon={MdPrint} title="Printer check" subtitle="Try each way. Then send a screenshot of this page.">
      <div className="space-y-6">
        {ROUTES.map(({ route, title, how }) => {
          const result = check.results[route];
          const words = said(result);
          return (
            <ListSection key={route} header={title}>
              <div className="space-y-3 px-4 py-3">
                <p className="text-[15px] text-muted">{how}</p>
                <Button className="w-full" variant={route === "bluetooth" && result?.outcome !== "printed" ? "primary" : "tinted"} disabled={Boolean(check.trying)} onClick={() => void check.tryRoute(route)}>
                  {check.trying === route ? "Trying…" : result ? `Try ${title} Again` : `Try ${title}`}
                </Button>
                {words && (
                  <p role="status" className={`flex items-start gap-2 text-[15px] ${words.good ? "text-success" : "text-ink"}`}>
                    {words.good && <MdCheckCircle aria-hidden className="mt-0.5 shrink-0 text-lg" />}
                    <span>{words.line}</span>
                  </p>
                )}
                {result && "detail" in result && <p className="text-[13px] break-all text-muted">{result.detail}</p>}
              </div>
            </ListSection>
          );
        })}
      </div>
    </Screen>
  );
}
