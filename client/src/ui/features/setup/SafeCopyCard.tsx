import { useState } from "react";
import { MdClose, MdVerifiedUser } from "react-icons/md";
import { useRestaurantName, useSafeCopyCard } from "../../../usecases/useRestaurant";
import { Button } from "../../design-system/Button";
import { AccountSheet } from "../account/AccountSheet";

// Once, on a phone that works without an account: the restaurant's records
// live only here until it signs in. Put away, the saved pill stays the way in.
export function SafeCopyCard() {
  const card = useSafeCopyCard();
  const name = useRestaurantName();
  const [open, setOpen] = useState(false);
  if (!card.show && !open) return null;

  return (
    <>
      {card.show && (
        <section className="mb-4 flex items-start gap-3 rounded-2xl bg-surface p-4">
          <MdVerifiedUser aria-hidden className="mt-0.5 shrink-0 text-2xl text-success" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold [overflow-wrap:anywhere]">Keep a copy of {name ?? "your restaurant"} safe</h2>
            <p className="mt-0.5 text-[15px] text-muted">Sign in with your email, and nothing is lost even if this phone is.</p>
            <Button size="compact" variant="tinted" className="-ml-1 mt-1" onClick={() => setOpen(true)}>
              Sign In
            </Button>
          </div>
          <button
            type="button"
            aria-label="Not now"
            onClick={card.dismiss}
            className="-mt-2 -mr-2 flex min-h-11 min-w-11 items-center justify-center text-xl text-muted"
          >
            <MdClose aria-hidden />
          </button>
        </section>
      )}
      <AccountSheet open={open} session={null} kept="device" onClose={() => setOpen(false)} />
    </>
  );
}
