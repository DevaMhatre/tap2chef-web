import { kotText, type Kot } from "../../domain/kot";
import { err, ok } from "../../domain/result";
import type { KitchenPrinter } from "../../usecases/ports";
import { receipt } from "./escpos";

// The KOT, ready for any way to a printer. The phone's print dialog works
// with whatever printer the phone already knows (Android print services,
// AirPrint, a desktop's printer) and prints every script; ESC/POS bytes are
// for Bluetooth or USB once the printer check says which (9b).

const time = (at: number) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** ESC/POS bytes for the slip: the title large and centred, then the lines. */
export const kotBytes = (kot: Kot): Uint8Array<ArrayBuffer> => receipt({ title: kot.title, lines: kotText(kot, time(kot.at)) });

const escape = (text: string) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/**
 * A page the size of the slip on a 58 mm roll: black on white, whatever the
 * app's theme. A page needs a real height ("auto" isn't one, and the browser
 * falls back to A4), so it is the slip's own: title, lines, margins.
 */
export function kotPage(kot: Kot): string {
  const lines = kotText(kot, time(kot.at));
  const height = Math.ceil(4 + 8 + lines.length * 3.75 + 4);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(kot.title)}</title><style>
@page { size: 58mm ${height}mm; margin: 2mm; }
/* 32 characters to the 54 mm a 58 mm roll prints: a monospace letter is about 0.6em wide. */
body { margin: 0; width: 54mm; color: #000; background: #fff; font: 2.75mm/1.35 ui-monospace, Menlo, Consolas, monospace; }
h1 { margin: 0 0 1mm; font-size: 5mm; text-align: center; }
pre { margin: 0; white-space: pre-wrap; font: inherit; }
</style></head><body><h1>${escape(kot.title)}</h1><pre>${lines.map(escape).join("\n")}</pre></body></html>`;
}

export const printDialogKitchen: KitchenPrinter = {
  async print(kot) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.append(frame);
    try {
      const page = frame.contentWindow!;
      page.document.open();
      page.document.write(kotPage(kot));
      page.document.close();
      page.focus();
      page.print();
      return ok(undefined);
    } catch {
      return err("failed");
    } finally {
      // The dialog holds the page while it is open; let it go afterwards.
      setTimeout(() => frame.remove(), 60_000);
    }
  },
};
