import type { Phone } from "../../../domain/phones";
import { Button } from "../../design-system/Button";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";

// Removing can't be undone once the phone has cleared itself, so it is asked
// once, saying exactly what happens.
export function RemovePhoneSheet({
  phone,
  restaurantName,
  onRemove,
  onClose,
}: {
  phone: Phone | undefined;
  restaurantName: string;
  onRemove: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(phone)} onClose={onClose} title="Remove Phone" dismissLabel="Cancel">
      {phone && (
        <div className="space-y-4">
          <p className="px-1 text-[17px]">
            It&rsquo;s signed out, and its copy of {restaurantName} is cleared next time it&rsquo;s online. Anything it hasn&rsquo;t sent yet is lost.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            onClick={async () => {
              if (await onRemove(phone.id)) {
                haptic();
                onClose();
              }
            }}
          >
            Remove {phone.label}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
