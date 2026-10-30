// ESC/POS, the command language of nearly every receipt printer: the wire
// format of printing. Text goes as plain ASCII, so only what a 58 mm
// printer's built-in font surely has (no ₹; "Rs" instead).

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const ascii = (text: string): number[] => [...text].map((c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 0x3f));

/** Bytes for a few lines: optional big centred title, then left-aligned lines, then paper fed out. */
export function receipt({ title, lines }: { title?: string; lines: readonly string[] }): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [ESC, 0x40]; // reset
  if (title) bytes.push(ESC, 0x61, 1, GS, 0x21, 0x11, ...ascii(title), LF, GS, 0x21, 0x00, ESC, 0x61, 0);
  for (const line of lines) bytes.push(...ascii(line), LF);
  bytes.push(ESC, 0x64, 4); // feed 4 lines, so the tear bar clears the text
  bytes.push(GS, 0x56, 0x01); // partial cut, ignored by printers without a cutter
  return Uint8Array.from(bytes);
}

/** What the check prints: a KOT as the kitchen would read it. */
export const testKot = (): Uint8Array<ArrayBuffer> =>
  receipt({
    title: "KOT - Table 4",
    lines: ["Tap2Chef printer check", "--------------------------------", "2 x Chicken Biryani", "1 x Butter Naan", "   less spicy", "--------------------------------", new Date().toLocaleTimeString("en-IN")],
  });
