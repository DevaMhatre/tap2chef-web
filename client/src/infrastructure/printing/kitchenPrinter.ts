import { kotLayout, type Kot, type KotRow } from "../../domain/kot";
import { err, ok } from "../../domain/result";
import type { KitchenPrinter } from "../../usecases/ports";
import { slip } from "./escpos";

// The KOT, ready for any way to a printer: ESC/POS bytes for the kitchen
// printer over Bluetooth, and a page for the phone's print dialog (a reprint
// when the printer isn't this phone's, or a printer the phone already knows).

export const kotTime = (at: number): string => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** ESC/POS bytes for the slip. */
export const kotBytes = (kot: Kot): Uint8Array<ArrayBuffer> => slip(kotLayout(kot, kotTime(kot.at)));

const escape = (text: string) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

// Millimetres each row takes, for the page's own height.
const ROW_MM: Record<KotRow["style"], number> = { small: 3.75, note: 3.75, dish: 6, title: 8, banner: 8 };

/**
 * A page the size of the slip on a 58 mm roll: black on white, whatever the
 * app's theme. A page needs a real height ("auto" isn't one, and the browser
 * falls back to A4), so it is the slip's own: its rows and margins.
 */
export function kotPage(kot: Kot): string {
  const rows = kotLayout(kot, kotTime(kot.at));
  const height = Math.ceil(8 + rows.reduce((mm, r) => mm + ROW_MM[r.style], 0));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(kot.title)}</title><style>
@page { size: 58mm ${height}mm; margin: 2mm; }
/* 32 characters to the 54 mm a 58 mm roll prints: a monospace letter is about 0.6em wide. */
body { margin: 0; width: 54mm; color: #000; background: #fff; font: 2.75mm/1.35 ui-monospace, Menlo, Consolas, monospace; }
p { margin: 0; white-space: pre; }
.title, .banner { font-size: 5.5mm; font-weight: bold; text-align: center; }
.banner { background: #000; color: #fff; }
/* A page can't print letters taller than they are wide, as the printer does; bold with room around it reads the same. */
.dish { font-weight: bold; line-height: 6mm; }
</style></head><body>${rows.map((r) => `<p class="${r.style}">${escape(r.text)}</p>`).join("")}</body></html>`;
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
