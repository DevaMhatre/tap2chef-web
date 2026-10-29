import { useEffect, useState } from "react";
import { MdCheckCircle } from "react-icons/md";
import type { DeviceSession } from "../../../domain/signIn";
import { CODE_LENGTH } from "../../../domain/signIn";
import { useSignIn, type SignIn, type SignInProblem } from "../../../usecases/useSignIn";
import type { Kept } from "../../../usecases/useSync";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { hapticSuccess } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useNow } from "../../useNow";

const PROBLEMS: Record<SignInProblem, string> = {
  badEmail: "Enter your email, like name@gmail.com.",
  offline: "Signing in needs the internet. Everything else works without it.",
  wrongCode: "That code isn't right. Check the email and try again.",
  expired: "That code has expired. Send a new one.",
  tooManyTries: "Too many tries. Send a new code.",
  noAccess: "This email no longer has access to a restaurant.",
  failed: "Something went wrong. Try again.",
  noName: "Enter the restaurant's name.",
  nameTooLong: "Keep it under 60 letters.",
};

type Props = { open: boolean; session: DeviceSession | null | undefined; kept: Kept; onClose: () => void };

// Where the device's work is kept: on this phone only, or also in the owner's
// account. Signed out, it is the way in; signed in, it says who. What it shows
// is decided when it opens: signing in mid-way must not swap the sheet away
// before its moment of completion.
export function AccountSheet({ open, session, kept, onClose }: Props) {
  const [opened, setOpened] = useState({ open: false, signIn: false, count: 0 });
  if (opened.open !== open) {
    setOpened({ open, signIn: open ? !session : opened.signIn, count: opened.count + (open ? 1 : 0) });
  }

  if (opened.signIn) return <SignInSheet key={opened.count} open={open} kept={kept} onClose={onClose} />;
  return (
    <Sheet open={open} onClose={onClose} title="Account" dismissLabel={null} action={<Done onClose={onClose} />}>
      {session && <SignedIn session={session} kept={kept} />}
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

const WHERE: Record<Kept, string> = {
  online: "Your menu, bills and expenses are saved in your account.",
  device: "Saved on this device for now. It goes to your account by itself when there is internet.",
};

function SignedIn({ session, kept, fresh = false }: { session: DeviceSession; kept: Kept; fresh?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 pt-2 pb-2 text-center">
      <MdCheckCircle aria-hidden className={`mb-1 text-5xl text-success ${fresh ? "animate-[pop_420ms_cubic-bezier(0.34,1.56,0.64,1)]" : ""}`} />
      <p className="text-[22px] font-bold">{fresh ? "Signed in" : session.restaurantName}</p>
      {fresh && <p className="text-[17px] font-semibold">{session.restaurantName}</p>}
      {/* Wraps rather than cuts: an email is read in full or not at all. */}
      <p className="text-[15px] text-muted">
        <EmailText email={session.email} />
      </p>
      <p className="mt-4 max-w-xs text-[15px] text-muted">{WHERE[kept]}</p>
    </div>
  );
}

function SignInSheet({ open, kept, onClose }: { open: boolean; kept: Kept; onClose: () => void }) {
  const signIn = useSignIn();
  const { flow } = signIn;
  const done = flow.step === "done";

  useEffect(() => {
    if (done) hapticSuccess();
  }, [done]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? "Account" : "Keep a Copy Safe"}
      dismissLabel={done ? null : "Cancel"}
      action={done ? <Done onClose={onClose} /> : undefined}
    >
      {flow.step === "done" ? (
        <SignedIn session={flow.session} kept={kept} fresh />
      ) : flow.step === "code" ? (
        <CodeStep signIn={signIn} email={flow.email} resendAt={flow.resendAt} />
      ) : flow.step === "name" ? (
        <NameStep signIn={signIn} />
      ) : (
        <EmailStep signIn={signIn} />
      )}
    </Sheet>
  );
}

// Not the typed text's fault: said quietly beside the field, never in red on it.
const CIRCUMSTANCES: readonly SignInProblem[] = ["offline", "failed"];

const fieldProblem = (signIn: SignIn) =>
  signIn.problem && !CIRCUMSTANCES.includes(signIn.problem) ? PROBLEMS[signIn.problem] : undefined;

function Circumstance({ signIn }: { signIn: SignIn }) {
  if (!signIn.problem || !CIRCUMSTANCES.includes(signIn.problem)) return null;
  return (
    <p role="status" className="px-1 text-[15px] text-muted">
      {PROBLEMS[signIn.problem]}
    </p>
  );
}

/** An email breaks at its @ if it must break at all, never inside "example.com". */
function EmailText({ email }: { email: string }) {
  const at = email.indexOf("@");
  return (
    <span className="[overflow-wrap:anywhere]">
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </span>
  );
}

function EmailStep({ signIn }: { signIn: SignIn }) {
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void signIn.sendCode();
      }}
    >
      <p className="px-1 text-[15px] text-muted">
        Sign in with your email, and your menu, bills and expenses are kept safe online, even if this phone is lost.
      </p>
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        placeholder="name@gmail.com"
        value={signIn.email}
        error={fieldProblem(signIn)}
        onChange={(e) => signIn.typeEmail(e.target.value)}
      />
      <Circumstance signIn={signIn} />
      <Button type="submit" className="w-full" disabled={signIn.busy}>
        {signIn.busy ? "Sending…" : "Send code"}
      </Button>
    </form>
  );
}

function CodeStep({ signIn, email, resendAt }: { signIn: SignIn; email: string; resendAt: number }) {
  const now = useNow(1000);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <div className="space-y-4">
      <p className="px-1 text-[15px] text-muted">
        Enter the code sent to{" "}
        <span className="font-semibold text-ink">
          <EmailText email={email} />
        </span>
        .
      </p>
      <TextField
        label={`${CODE_LENGTH}-digit code`}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        className="[&_input]:text-center [&_input]:text-[28px] [&_input]:tracking-[0.4em] [&_input]:tabular-nums"
        value={signIn.code}
        disabled={signIn.busy}
        error={fieldProblem(signIn)}
        hint={signIn.busy ? "Checking…" : "It comes by email within a minute. Check spam if it doesn't."}
        onChange={(e) => signIn.typeCode(e.target.value)}
      />
      <Circumstance signIn={signIn} />
      <div className="flex items-center justify-between">
        <Button variant="plain" className="-ml-3" onClick={signIn.changeEmail} disabled={signIn.busy}>
          Change email
        </Button>
        <Button variant="plain" className="-mr-3 tabular-nums" onClick={() => void signIn.resend()} disabled={signIn.busy || wait > 0}>
          {wait > 0 ? `Send again in ${wait}s` : "Send again"}
        </Button>
      </div>
    </div>
  );
}

function NameStep({ signIn }: { signIn: SignIn }) {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void signIn.finish();
      }}
    >
      <p className="px-1 text-[15px] text-muted">One last thing: what is your restaurant called?</p>
      <TextField
        label="Restaurant name"
        autoComplete="organization"
        autoCapitalize="words"
        autoFocus
        placeholder="Sharma Dhaba"
        value={signIn.name}
        error={fieldProblem(signIn)}
        onChange={(e) => signIn.typeName(e.target.value)}
      />
      <Circumstance signIn={signIn} />
      <Button type="submit" className="w-full" disabled={signIn.busy}>
        {signIn.busy ? "Signing in…" : "Finish signing in"}
      </Button>
    </form>
  );
}
