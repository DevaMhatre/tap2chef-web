import { useEffect, useState } from "react";
import { MdCheckCircle } from "react-icons/md";
import { useAddPhone, type AddPhone } from "../../../usecases/usePhones";
import { Button } from "../../design-system/Button";
import { hapticSuccess } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useNow } from "../../useNow";
import { QrCode } from "./QrCode";

const UNAVAILABLE = {
  offline: "Adding a phone needs the internet on this phone.",
  notOwnerPhone: "Only the owner's phone can add phones.",
  failed: "Couldn't make a code. Try again in a moment.",
} as const;

// Shows a code until a phone joins with it. Each opening asks for a fresh one.
export function AddPhoneSheet({ open, restaurantName, onClose }: { open: boolean; restaurantName: string; onClose: () => void }) {
  const [openings, setOpenings] = useState({ open: false, count: 0 });
  if (openings.open !== open) setOpenings({ open, count: openings.count + (open ? 1 : 0) });
  return (
    <Sheet open={open} onClose={onClose} title="Add a Phone" dismissLabel={null} action={<Done onClose={onClose} />}>
      {open && <Showing key={openings.count} restaurantName={restaurantName} />}
    </Sheet>
  );
}

function Done({ onClose }: { onClose: () => void }) {
  return (
    <Button size="compact" variant="tinted" onClick={onClose}>
      Done
    </Button>
  );
}

function Showing({ restaurantName }: { restaurantName: string }) {
  const add = useAddPhone();
  if (add.state === "loading") return <p className="py-16 text-center text-[15px] text-muted">Making a code…</p>;
  if (add.state === "unavailable") return <p className="py-16 text-center text-[15px] text-muted">{UNAVAILABLE[add.problem]}</p>;
  if (add.state === "joined") return <Joined add={add} restaurantName={restaurantName} />;
  return <Code add={add} />;
}

function Code({ add }: { add: Extract<AddPhone, { state: "showing" }> }) {
  const now = useNow(1000);
  const minutes = Math.max(1, Math.ceil((add.expiresAt - now) / 60_000));
  const link = `${window.location.origin}/join#${add.code}`;
  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-4 pb-2 text-center">
      <p className="text-[15px] text-muted">On the new phone, scan this with the camera.</p>
      <QrCode value={link} label={`A code to join, ${add.code}`} />
      <p className="text-[15px] text-muted">Or open Tap2Chef on it and type</p>
      <p className="text-[34px] leading-none font-bold tracking-[0.2em] tabular-nums">
        {add.code.slice(0, 3)} {add.code.slice(3)}
      </p>
      <p className="text-[13px] text-muted tabular-nums">Works for {minutes} min, once. A new one comes by itself.</p>
    </div>
  );
}

function Joined({ add, restaurantName }: { add: Extract<AddPhone, { state: "joined" }>; restaurantName: string }) {
  useEffect(() => hapticSuccess(), []);
  return (
    <div className="flex flex-col items-center gap-1 py-10 text-center">
      <MdCheckCircle aria-hidden className="mb-2 animate-[pop_420ms_cubic-bezier(0.34,1.56,0.64,1)] text-6xl text-success" />
      <p className="text-[22px] font-bold">{add.label} joined</p>
      <p className="text-[15px] text-muted [overflow-wrap:anywhere]">It works in {restaurantName} now.</p>
    </div>
  );
}
