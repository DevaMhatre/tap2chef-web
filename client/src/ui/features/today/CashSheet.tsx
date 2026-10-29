import { useRef, useState } from "react";
import type { DrawerKind } from "../../../domain/drawer";
import { parseRupees, toRupeeText } from "../../../domain/money";
import type { Day } from "../../../usecases/useDayNumbers";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { formatPrice, formatSigned } from "../../format";

type Ready = Extract<Day, { state: "ready" }>;
type Props = { kind: DrawerKind | null; day: Ready; onClose: () => void };

const TITLES: Record<DrawerKind, string> = { opening: "Started With", counted: "Count the Drawer" };

// One amount, typed: what the cash box began the day with, or what is in it now.
export function CashSheet({ kind, day, onClose }: Props) {
  return (
    <Sheet open={kind !== null} onClose={onClose} title={kind ? TITLES[kind] : ""}>
      {kind && <CashForm key={kind} kind={kind} day={day} onClose={onClose} />}
    </Sheet>
  );
}

function CashForm({ kind, day, onClose }: { kind: DrawerKind; day: Ready; onClose: () => void }) {
  const { drawer } = day;
  // Starts from what is stored, or what yesterday's count carried in: re-opening shows the answer.
  const known = kind === "opening" ? drawer.opening : drawer.counted;
  const [text, setText] = useState(known === undefined ? "" : toRupeeText(known));
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const showUndo = useUndoToast();

  async function save() {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await day.stateDrawer(kind, text);
      if (!result.ok) return setError("Enter the amount, like 1500 or 120.50.");
      haptic();
      onClose();
      showUndo(`${kind === "opening" ? "Started with" : "Counted"} ${formatPrice(parseRupees(text)!)} saved`, result.value);
    } catch {
      setError("Couldn't save on this device. Try again.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <TextField
        label={kind === "opening" ? "Cash the drawer started with" : "Cash in the drawer now"}
        prefix="₹"
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        placeholder="0"
        value={text}
        error={error}
        hint={
          kind === "counted" && drawer.expected !== undefined
            ? `It should hold ${formatSigned(drawer.expected)}.`
            : kind === "opening" && drawer.carried
              ? "Carried from yesterday's count."
              : undefined
        }
        onChange={(e) => {
          setText(e.target.value);
          setError(undefined);
        }}
      />
      <Button className="w-full" onClick={save}>
        Save
      </Button>
    </div>
  );
}
