import { useState } from "react";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { Button } from "../../design-system/Button";
import { DietMark } from "../../design-system/DietMark";
import { TextField } from "../../design-system/Field";
import { ListNote, ListSection } from "../../design-system/GroupedList";
import { Sheet } from "../../design-system/Sheet";
import { Switch } from "../../design-system/Switch";

type Props = { open: boolean; screen: ReadyOrder; onClose: () => void };

// "No paneer today." Switched off here, a dish can't be ordered until it is
// switched back on, or until tomorrow — nothing to remember to reset.
export function OutTodaySheet({ open, screen, onClose }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Available Today"
      dismissLabel={null}
      action={
        <Button size="compact" variant="tinted" onClick={onClose}>
          Done
        </Button>
      }
    >
      {open && <OutTodayList screen={screen} />}
    </Sheet>
  );
}

function OutTodayList({ screen }: { screen: ReadyOrder }) {
  const [query, setQuery] = useState("");
  // What was out when the sheet opened goes first, and stays put while
  // switches flip, so no row jumps from under a thumb.
  const [outFirst] = useState(() => new Set(screen.dishes.filter((d) => d.out).map((d) => d.item.id)));
  const listed = query.trim() === "" ? screen.dishes : screen.search(query);
  const dishes = [...listed.filter((d) => outFirst.has(d.item.id)), ...listed.filter((d) => !outFirst.has(d.item.id))];
  const outCount = screen.dishes.filter((d) => d.out).length;

  return (
    <div className="space-y-4">
      <TextField label="Search dishes" labelHidden type="search" placeholder="Search dishes" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ListSection
        header={outCount > 0 ? `${outCount} out today` : "Everything is available"}
        footer="Back on automatically tomorrow."
      >
        {dishes.length === 0 ? (
          <ListNote>No dish matches</ListNote>
        ) : (
          dishes.map((dish) => (
            <div key={dish.item.id} className="flex min-h-11 items-center gap-3 py-1 pr-2 pl-4">
              <DietMark diet={dish.item.diet} decorative />
              <span className={`min-w-0 flex-1 truncate text-[17px] ${dish.out ? "text-muted" : ""}`}>{dish.item.name}</span>
              <Switch label={`${dish.item.name} available`} checked={!dish.out} onChange={(available) => void screen.setOutToday(dish.item.id, !available)} />
            </div>
          ))
        )}
      </ListSection>
    </div>
  );
}
