import type { IconType } from "react-icons";
import { MdCheckCircle, MdRadioButtonUnchecked, MdTableRestaurant, MdTakeoutDining } from "react-icons/md";
import type { ServiceChoice } from "../../../domain/setup";

const WAYS: { kind: keyof ServiceChoice; icon: IconType; label: string; detail: string }[] = [
  { kind: "dineIn", icon: MdTableRestaurant, label: "Dine-in", detail: "They sit at a table" },
  { kind: "takeaway", icon: MdTakeoutDining, label: "Takeaway & delivery", detail: "They take it with them" },
];

/** How customers order, as the setup asks it and the restaurant sheet changes it. The tiles only choose. */
export function ServiceTiles({ choice, onToggle, surface = "bg-surface" }: { choice: ServiceChoice; onToggle: (kind: keyof ServiceChoice) => void; surface?: string }) {
  return (
    <div role="group" aria-label="How customers order" className="space-y-3">
      {WAYS.map(({ kind, icon: Icon, label, detail }) => {
        const on = choice[kind];
        return (
          <button
            key={kind}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(kind)}
            className={`flex min-h-20 w-full items-center gap-4 rounded-2xl ${surface} px-4 text-left transition-transform active:scale-[0.98] ${
              on ? "ring-2 ring-primary" : ""
            }`}
          >
            <Icon aria-hidden className="shrink-0 text-3xl text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold">{label}</span>
              <span className="block text-[15px] text-muted">{detail}</span>
            </span>
            {on ? (
              <MdCheckCircle aria-hidden className="shrink-0 text-2xl text-primary" />
            ) : (
              <MdRadioButtonUnchecked aria-hidden className="shrink-0 text-2xl text-muted/60" />
            )}
          </button>
        );
      })}
    </div>
  );
}
