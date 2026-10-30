import { useState } from "react";
import { useRestaurantDetails, type RestaurantDetailsProblem } from "../../../usecases/useRestaurantDetails";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { hapticSuccess } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { ServiceTiles } from "../setup/ServiceTiles";

const PROBLEMS: Record<RestaurantDetailsProblem, string> = {
  noName: "Enter the restaurant's name.",
  nameTooLong: "Keep it under 60 letters.",
  noService: "Choose at least one.",
};

// Behind the restaurant's name: only what the owner told the setup, to
// change. People, phones and a second restaurant join it with their steps.
// Each opening is a fresh editor, so the form starts from what is stored.
export function RestaurantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [openings, setOpenings] = useState({ open: false, count: 0 });
  if (openings.open !== open) setOpenings({ open, count: openings.count + (open ? 1 : 0) });
  return <Editor key={openings.count} open={open} onClose={onClose} />;
}

function Editor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const details = useRestaurantDetails();
  const ready = details.state === "ready" ? details : undefined;
  const nameProblem = ready?.problem === "noName" || ready?.problem === "nameTooLong" ? PROBLEMS[ready.problem] : undefined;

  const save = (
    <Button
      size="compact"
      disabled={!ready?.changed}
      onClick={async () => {
        if (!ready || !(await ready.save())) return;
        hapticSuccess();
        onClose();
      }}
    >
      Save
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Restaurant" dismissLabel="Cancel" action={save}>
      {ready && (
        <div className="space-y-6">
          <TextField
            label="Name"
            autoComplete="organization"
            autoCapitalize="words"
            value={ready.name}
            error={nameProblem}
            onChange={(e) => ready.typeName(e.target.value)}
          />
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted">How customers order</p>
            <ServiceTiles choice={ready.choice} onToggle={ready.toggle} surface="bg-surface-2" />
            {ready.problem === "noService" && (
              <p role="alert" className="mt-1.5 px-1 text-[13px] font-medium text-primary">
                {PROBLEMS.noService}
              </p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
