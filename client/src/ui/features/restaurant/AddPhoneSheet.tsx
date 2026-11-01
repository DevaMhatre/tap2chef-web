import { useEffect, useState } from "react";
import { MdCheckCircle } from "react-icons/md";
import { useAddPhone, type AddPhone } from "../../../usecases/usePhones";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { SegmentedControl } from "../../design-system/SegmentedControl";
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
  if (add.state === "who") return <Who add={add} />;
  if (add.state === "loading") return <p className="py-16 text-center text-[15px] text-muted">Making a code…</p>;
  if (add.state === "unavailable") return <p className="py-16 text-center text-[15px] text-muted">{UNAVAILABLE[add.problem]}</p>;
  if (add.state === "joined") return <Joined add={add} restaurantName={restaurantName} />;
  return <Code add={add} />;
}

const WHO_PROBLEMS = {
  noName: "Enter their name.",
  nameTooLong: "Keep it under 40 letters.",
  noAnswer: "Choose Yes or No.",
} as const;

// The phone is a person: who it is for decides what it can do. The answer
// only chooses; "Show Code" commits.
function Who({ add }: { add: Extract<AddPhone, { state: "who" }> }) {
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        add.showCode();
      }}
    >
      <TextField
        label="Whose phone is it?"
        autoCapitalize="words"
        autoComplete="off"
        autoFocus
        placeholder="Ravi"
        value={add.name}
        error={add.problem === "noName" || add.problem === "nameTooLong" ? WHO_PROBLEMS[add.problem] : undefined}
        onChange={(e) => add.typeName(e.target.value)}
      />
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-muted">Can they handle money and the menu when you&rsquo;re away?</p>
        <SegmentedControl
          label="Can they handle money and the menu when you're away?"
          options={ANSWERS}
          value={add.manages === null ? null : add.manages ? "yes" : "no"}
          invalid={add.problem === "noAnswer"}
          onChange={(value) => add.answer(value === "yes")}
        />
        <p className={`mt-1.5 px-1 text-[13px] ${add.problem === "noAnswer" ? "font-medium text-primary" : "text-muted"}`}>
          {add.problem === "noAnswer"
            ? WHO_PROBLEMS.noAnswer
            : add.manages === true
              ? "They can also see the day’s money, the cash drawer and edit the menu. Discounts stay yours."
              : add.manages === false
                ? "They take orders and payments. Discounts, the day’s money and the menu stay with you."
                : "Discounts are always yours alone."}
        </p>
      </div>
      <Button type="submit" className="w-full">
        Show Code
      </Button>
    </form>
  );
}

const ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

function Code({ add }: { add: Extract<AddPhone, { state: "showing" }> }) {
  const now = useNow(1000);
  const minutes = Math.max(1, Math.ceil((add.expiresAt - now) / 60_000));
  const link = `${window.location.origin}/join#${add.code}`;
  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-4 pb-2 text-center">
      <p className="text-[15px] text-muted [overflow-wrap:anywhere]">On {add.person}&rsquo;s phone, scan this with the camera.</p>
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
      <p className="text-[22px] font-bold [overflow-wrap:anywhere]">{add.person}&rsquo;s phone joined</p>
      <p className="text-[15px] text-muted [overflow-wrap:anywhere]">
        {add.label} · works in {restaurantName} now.
      </p>
    </div>
  );
}
