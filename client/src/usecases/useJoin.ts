import { useEffect, useRef, useState } from "react";
import { codeDigits } from "../domain/signIn";
import { JOIN_CODE_LENGTH } from "../domain/phones";
import type { JoinError } from "./ports";
import { usePorts } from "./PortsProvider";

/** A new phone joining a restaurant with the code on the owner's phone. */
export type Join =
  | { step: "checking" }
  /** This phone already keeps a restaurant: joining would mix the two. */
  | { step: "taken" }
  | { step: "code"; code: string; busy: boolean; problem?: JoinError; typeCode(text: string): void }
  | { step: "confirm"; restaurantName: string; busy: boolean; problem?: JoinError; join(): Promise<void>; changeCode(): void }
  | { step: "joined"; restaurantName: string };

/**
 * Only a phone with nothing on it joins: a waiter's test dishes must never
 * land in the real menu. The code is checked first ("Join Sharma Dhaba?"),
 * used only on Join. `linkCode` comes from the scanned link, if any.
 */
export function useJoin(linkCode?: string): Join {
  const { account, setup } = usePorts();
  const [empty, setEmpty] = useState<boolean>();
  const [code, setCode] = useState(() => codeDigits(linkCode ?? ""));
  const [found, setFound] = useState<{ code: string; restaurantName: string }>();
  const [joined, setJoined] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<JoinError>();
  // useState is too late for a second tap in the same frame.
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    void setup.isEmptyDevice().then((answer) => live && setEmpty(answer));
    return () => {
      live = false;
      request.current?.abort();
    };
  }, [setup]);

  async function once(task: (signal: AbortSignal) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setProblem(undefined);
    try {
      await task(controller.signal);
    } catch {
      // An abort means the screen went away; anything else is a failure to say.
      if (!controller.signal.aborted) setProblem("failed");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const look = (digits: string) =>
    once(async (signal) => {
      const result = await account.previewJoin(digits, signal);
      if (signal.aborted) return;
      if (result.ok) return setFound({ code: digits, restaurantName: result.value.restaurantName });
      setProblem(result.error);
      if (result.error === "wrongCode") setCode("");
    });

  // A scanned link brings its code: look it up at once.
  const looked = useRef(false);
  useEffect(() => {
    if (empty !== true || looked.current || code.length !== JOIN_CODE_LENGTH) return;
    looked.current = true;
    void look(code);
  });

  if (joined !== undefined) return { step: "joined", restaurantName: joined };
  if (empty === undefined) return { step: "checking" };
  if (!empty) return { step: "taken" };

  if (found) {
    return {
      step: "confirm",
      restaurantName: found.restaurantName,
      busy,
      problem,
      join: () =>
        once(async (signal) => {
          const result = await account.join(found.code, signal);
          if (signal.aborted) return;
          if (!result.ok) {
            setProblem(result.error);
            // Used or expired meanwhile: a new code is needed.
            if (result.error === "wrongCode") {
              setFound(undefined);
              setCode("");
            }
            return;
          }
          await setup.save({ step: "done" });
          setJoined(result.value.restaurantName);
        }),
      changeCode() {
        if (inFlight.current) return;
        setFound(undefined);
        setCode("");
        setProblem(undefined);
      },
    };
  }

  return {
    step: "code",
    code,
    busy,
    problem,
    typeCode(text) {
      const digits = codeDigits(text);
      setCode(digits);
      setProblem(undefined);
      if (digits.length === JOIN_CODE_LENGTH) void look(digits);
    },
  };
}
