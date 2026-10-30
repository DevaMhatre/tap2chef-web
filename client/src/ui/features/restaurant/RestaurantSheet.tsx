import { useState } from "react";
import { MdAdd } from "react-icons/md";
import type { Phone } from "../../../domain/phones";
import { usePhones } from "../../../usecases/usePhones";
import { useRestaurantDetails, type RestaurantDetailsProblem } from "../../../usecases/useRestaurantDetails";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { hapticSuccess } from "../../design-system/haptic";
import { ListNote, ListRow, ListSection } from "../../design-system/GroupedList";
import { Sheet } from "../../design-system/Sheet";
import { formatLastSeen } from "../../format";
import { useNow } from "../../useNow";
import { ServiceTiles } from "../setup/ServiceTiles";

const PROBLEMS: Record<RestaurantDetailsProblem, string> = {
  noName: "Enter the restaurant's name.",
  nameTooLong: "Keep it under 60 letters.",
  noService: "Choose at least one.",
};

// Behind the restaurant's name: only what the owner told the setup, to
// change. People, phones and a second restaurant join it with their steps.
// Each opening is a fresh editor, so the form starts from what is stored.
type Props = {
  open: boolean;
  onClose: () => void;
  /** These open their own sheet, in this one's place. */
  onAddPhone: () => void;
  onRemovePhone: (phone: Phone) => void;
};

export function RestaurantSheet(props: Props) {
  const [openings, setOpenings] = useState({ open: false, count: 0 });
  if (openings.open !== props.open) setOpenings({ open: props.open, count: openings.count + (props.open ? 1 : 0) });
  return <Editor key={openings.count} {...props} />;
}

function Editor({ open, onClose, onAddPhone, onRemovePhone }: Props) {
  const details = useRestaurantDetails();
  const ready = details.state === "ready" ? details : undefined;
  const nameProblem = ready?.problem === "noName" || ready?.problem === "nameTooLong" ? PROBLEMS[ready.problem] : undefined;

  // A linked phone sees what the owner set, and nothing to commit.
  const save = !ready?.canEdit ? (
    <Button size="compact" variant="tinted" onClick={onClose}>
      Done
    </Button>
  ) : (
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
    <Sheet open={open} onClose={onClose} title="Restaurant" dismissLabel={ready?.canEdit === false ? null : "Cancel"} action={save}>
      {ready && (
        <div className="space-y-6">
          <TextField
            label="Name"
            autoComplete="organization"
            autoCapitalize="words"
            value={ready.name}
            disabled={!ready.canEdit}
            error={nameProblem}
            onChange={(e) => ready.typeName(e.target.value)}
          />
          <div>
            <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted">How customers order</p>
            <fieldset disabled={!ready.canEdit} className="disabled:opacity-60">
              <ServiceTiles choice={ready.choice} onToggle={ready.toggle} surface="bg-surface-2" />
            </fieldset>
            {ready.problem === "noService" && (
              <p role="alert" className="mt-1.5 px-1 text-[13px] font-medium text-primary">
                {PROBLEMS.noService}
              </p>
            )}
            {!ready.canEdit && <p className="mt-1.5 px-1 text-[13px] text-muted">Only the owner&rsquo;s phone can change these.</p>}
          </div>
          {open && <PhonesSection onAdd={onAddPhone} onRemove={onRemovePhone} />}
        </div>
      )}
    </Sheet>
  );
}

// The restaurant's phones, on the owner's own phone only: every other phone
// works, the owner's phone manages.
function PhonesSection({ onAdd, onRemove }: { onAdd: () => void; onRemove: (phone: Phone) => void }) {
  const phones = usePhones();
  const now = useNow(60_000);
  if (phones.state === "hidden") return null;
  return (
    <ListSection header="Phones">
      {phones.state === "loading" && <ListNote>Looking for phones…</ListNote>}
      {phones.state === "unavailable" && (
        <ListNote>{phones.problem === "offline" ? "Phones show when this phone is online." : "Couldn't load the phones. Try again in a moment."}</ListNote>
      )}
      {phones.state === "ready" &&
        phones.phones.map((phone) => (
          <div key={phone.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px]">{phone.label}</span>
              <span className="block truncate text-[13px] text-muted">{phone.current ? "This phone" : formatLastSeen(phone.lastSeenAt, now)}</span>
            </span>
            {!phone.current && (
              <Button variant="plain" size="compact" className="-mr-3" onClick={() => onRemove(phone)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      {phones.state !== "unavailable" && (
        <ListRow leading={<MdAdd aria-hidden className="text-xl text-primary" />} className="font-semibold text-primary" onClick={onAdd}>
          Add a Phone
        </ListRow>
      )}
    </ListSection>
  );
}
