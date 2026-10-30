import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { IconType } from "react-icons";
import {
  MdCheckCircle,
  MdChevronLeft,
  MdStorefront,
  MdVerifiedUser,
} from "react-icons/md";
import { useSetup, type Setup } from "../../../usecases/useSetup";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { hapticSuccess } from "../../design-system/haptic";
import { CodeStep, EmailStep } from "../account/AccountSheet";
import { TableSetup } from "../tables/TableSetup";
import { ServiceTiles } from "./ServiceTiles";
import { StarterList } from "./StarterList";

type Step<S extends Setup["step"]> = { setup: Extract<Setup, { step: S }> };

// A new owner's first minutes: one question per screen, each answer changing
// what they see today. No step counter and no Skip on every screen: the
// questions are few, and only the menu can wait.
export function SetupFlow() {
  const setup = useSetup();
  switch (setup.step) {
    case "loading":
    case "done":
      return null;
    case "account":
      return <AccountScreen setup={setup} />;
    case "name":
      return <NameScreen setup={setup} />;
    case "service":
      return <ServiceScreen setup={setup} />;
    case "tables":
      return (
        <Screen back={setup.back}>
          <TableSetup suggestedCount={setup.suggestedCount} setUp={setup.setUp} />
        </Screen>
      );
    case "menu":
      return <StarterList setup={setup} />;
    case "ready":
      return <ReadyScreen setup={setup} />;
  }
}

/** The frame every setup screen shares: a way back, if there is one, and the question. */
export function Screen({
  back,
  icon: Icon,
  title,
  subtitle,
  children,
  footer,
}: {
  back?: () => void;
  icon?: IconType;
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <div className="flex h-14 shrink-0 items-center px-1 pt-[env(safe-area-inset-top)]">
        {back && (
          <button
            type="button"
            aria-label="Back"
            onClick={back}
            className="flex min-h-11 min-w-11 items-center justify-center text-3xl text-primary transition-transform active:scale-90"
          >
            <MdChevronLeft aria-hidden />
          </button>
        )}
      </div>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-8">
        {title && (
          <header className="mb-6 flex flex-col items-center text-center">
            {Icon && <Icon aria-hidden className="mb-4 text-6xl text-primary" />}
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-[17px] text-muted">{subtitle}</p>}
          </header>
        )}
        {children}
      </main>
      {footer && (
        <div className="sticky bottom-0 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-md">{footer}</div>
        </div>
      )}
    </div>
  );
}

function AccountScreen({ setup }: Step<"account">) {
  const { signIn, online } = setup;
  const navigate = useNavigate();
  // Online, a code that doesn't come or a failing server mustn't hold the
  // owner here. Offline, setting up is the one thing that works, so it is
  // the filled button and the email waits for the internet.
  const stuck = signIn.problem === "offline" || signIn.problem === "failed" || signIn.flow.step === "code";
  return (
    <Screen
      icon={MdVerifiedUser}
      title="Keep your restaurant safe"
      subtitle="Your email keeps a copy of your menu, bills and expenses, even if this phone is lost."
    >
      {!online ? (
        <div className="space-y-4">
          <p role="status" className="px-1 text-center text-[15px] text-muted">
            No internet right now. Set up now, and keep a copy once you&rsquo;re online.
          </p>
          <Button className="w-full" onClick={() => void setup.later()}>
            Set Up Now
          </Button>
        </div>
      ) : signIn.flow.step === "code" ? (
        <CodeStep signIn={signIn} email={signIn.flow.email} resendAt={signIn.flow.resendAt} />
      ) : (
        <EmailStep signIn={signIn} intro={false} />
      )}
      {online && stuck && (
        <Button variant="plain" className="mt-2 w-full" onClick={() => void setup.later()}>
          Set up now, sign in later
        </Button>
      )}
      {/* A waiter's phone joins the owner's restaurant instead of setting one up. */}
      {signIn.flow.step === "email" && (
        <Button variant="plain" className="mt-6 w-full" onClick={() => navigate("/join")}>
          Joining a restaurant? Enter its code
        </Button>
      )}
    </Screen>
  );
}

const NAME_PROBLEMS = { noName: "Enter the restaurant's name.", nameTooLong: "Keep it under 60 letters." } as const;

function NameScreen({ setup }: Step<"name">) {
  return (
    <Screen icon={MdStorefront} title="What’s your restaurant called?" subtitle="It goes at the top of every screen.">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void setup.next();
        }}
      >
        <TextField
          label="Restaurant name"
          autoComplete="organization"
          autoCapitalize="words"
          autoFocus
          placeholder="Sharma Dhaba"
          value={setup.name}
          error={setup.problem && NAME_PROBLEMS[setup.problem]}
          onChange={(e) => setup.typeName(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={setup.busy}>
          Next
        </Button>
      </form>
    </Screen>
  );
}

function ServiceScreen({ setup }: Step<"service">) {
  return (
    <Screen back={() => void setup.back()} title="How do customers order?" subtitle="Choose one or both.">
      {/* Tiles only choose (a selection never commits); Next commits. */}
      <ServiceTiles choice={setup.choice} onToggle={setup.toggle} />
      {setup.problem && (
        <p role="alert" className="mt-3 px-1 text-[13px] font-medium text-primary">
          Choose at least one.
        </p>
      )}
      <Button className="mt-6 w-full" onClick={() => void setup.next()}>
        Next
      </Button>
    </Screen>
  );
}

function ReadyScreen({ setup }: Step<"ready">) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => hapticSuccess(), []);

  const place = setup.service === "takeaway" ? "Takeaway" : `${setup.tables} ${setup.tables === 1 ? "table" : "tables"}`;
  const dishes = setup.dishes === 1 ? "1 dish" : `${setup.dishes} dishes`;
  return (
    <Screen>
      <section className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <MdCheckCircle aria-hidden className="mb-4 animate-[pop_420ms_cubic-bezier(0.34,1.56,0.64,1)] text-7xl text-success" />
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">You&rsquo;re ready</h1>
        <p className="mt-2 text-[22px] font-semibold [overflow-wrap:anywhere]">{setup.name}</p>
        <p className="mt-1 text-[17px] text-muted tabular-nums">
          {setup.dishes > 0 ? `${place} · ${dishes}` : `${place} · add your dishes in Menu`}
        </p>
        <Button
          className="mt-8 w-full"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            // Home is where the service happens: the floor, or the takeaway list.
            navigate(setup.service === "takeaway" ? "/orders" : "/tables", { replace: true });
            void setup.start();
          }}
        >
          Start Taking Orders
        </Button>
      </section>
    </Screen>
  );
}
