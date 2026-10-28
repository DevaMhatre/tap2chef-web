export type DietKind = "veg" | "nonVeg" | "egg";

const LABEL: Record<DietKind, string> = { veg: "Veg", nonVeg: "Non-veg", egg: "Egg" };
const COLOR: Record<DietKind, string> = { veg: "text-veg", nonVeg: "text-nonveg", egg: "text-egg" };

// The mark Indian diners already read on every packet and menu: a square with
// a dot for veg, a triangle for non-veg. `decorative` when a visible word next
// to it already says Veg/Non-veg.
export function DietMark({ diet, decorative }: { diet: DietKind; decorative?: boolean }) {
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": LABEL[diet] };
  return (
    <svg viewBox="0 0 16 16" {...a11y} className={`h-4 w-4 shrink-0 ${COLOR[diet]}`}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {diet === "nonVeg" ? <path d="M8 4.5 11.5 11h-7z" fill="currentColor" /> : <circle cx="8" cy="8" r="3.5" fill="currentColor" />}
    </svg>
  );
}
