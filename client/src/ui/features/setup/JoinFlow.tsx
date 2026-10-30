import { useEffect } from "react";
import { useNavigate } from "react-router";
import { MdCheckCircle, MdPhonelinkRing, MdStorefront } from "react-icons/md";
import { useJoin, type Join } from "../../../usecases/useJoin";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { hapticSuccess } from "../../design-system/haptic";
import { Screen } from "./SetupFlow";

type Step<S extends Join["step"]> = { join: Extract<Join, { step: S }> };

// A new phone joining the restaurant of the owner's phone beside it: the code
// (from the camera, or typed), "Join Sharma Dhaba?", and it is working.
export function JoinFlow({ linkCode }: { linkCode?: string }) {
  const join = useJoin(linkCode);
  const navigate = useNavigate();
  const home = () => navigate("/", { replace: true });

  switch (join.step) {
    case "checking":
      return null;
    case "taken":
      return (
        <Screen icon={MdStorefront} title="This phone has its own restaurant" subtitle="A phone that already keeps a restaurant can’t join another, so the two never mix.">
          <Button className="w-full" onClick={home}>
            Go Back
          </Button>
        </Screen>
      );
    case "code":
      return <CodeScreen join={join} onBack={home} />;
    case "confirm":
      return <ConfirmScreen join={join} />;
    case "joined":
      return <JoinedScreen join={join} onStart={home} />;
  }
}

function CodeScreen({ join, onBack }: Step<"code"> & { onBack: () => void }) {
  return (
    <Screen back={onBack} icon={MdPhonelinkRing} title="Join a restaurant" subtitle="On the owner’s phone, tap the restaurant’s name, then Add a Phone.">
      <div className="space-y-4">
        <TextField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="[&_input]:text-center [&_input]:text-[28px] [&_input]:tracking-[0.4em] [&_input]:tabular-nums"
          value={join.code}
          disabled={join.busy}
          error={join.problem === "wrongCode" ? "That code isn’t right, or it has expired. Ask for a new one." : undefined}
          hint={join.busy ? "Checking…" : undefined}
          onChange={(e) => join.typeCode(e.target.value)}
        />
        {(join.problem === "offline" || join.problem === "failed") && (
          <p role="status" className="px-1 text-[15px] text-muted">
            {join.problem === "offline" ? "Joining needs the internet, once." : "Something went wrong. Try again."}
          </p>
        )}
      </div>
    </Screen>
  );
}

function ConfirmScreen({ join }: Step<"confirm">) {
  return (
    <Screen icon={MdStorefront} title={`Join ${join.restaurantName}?`} subtitle="This phone will take its orders and bills, and stay in step with the owner’s phone.">
      <Button className="w-full" disabled={join.busy} onClick={() => void join.join()}>
        {join.busy ? "Joining…" : "Join"}
      </Button>
      {join.problem && join.problem !== "wrongCode" && (
        <p role="status" className="mt-3 px-1 text-center text-[15px] text-muted">
          {join.problem === "offline" ? "Joining needs the internet, once." : "Something went wrong. Try again."}
        </p>
      )}
      <Button variant="plain" className="mt-2 w-full" disabled={join.busy} onClick={join.changeCode}>
        Not this restaurant
      </Button>
    </Screen>
  );
}

function JoinedScreen({ join, onStart }: Step<"joined"> & { onStart: () => void }) {
  useEffect(() => hapticSuccess(), []);
  return (
    <Screen>
      <section className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <MdCheckCircle aria-hidden className="mb-4 animate-[pop_420ms_cubic-bezier(0.34,1.56,0.64,1)] text-7xl text-success" />
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">You&rsquo;re in</h1>
        <p className="mt-2 text-[22px] font-semibold [overflow-wrap:anywhere]">{join.restaurantName}</p>
        <Button className="mt-8 w-full" onClick={onStart}>
          Start Taking Orders
        </Button>
      </section>
    </Screen>
  );
}
