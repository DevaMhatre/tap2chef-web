import { useEffect, useRef, useState } from "react";
import { codeDigits, CODE_LENGTH, readEmail, readRestaurantName, type DeviceSession, type Email } from "../domain/signIn";
import type { SignInError } from "./ports";
import { usePorts } from "./PortsProvider";

export type SignInStep =
  | { step: "email" }
  /** `resendAt`: when another code may be asked for. */
  | { step: "code"; email: Email; resendAt: number }
  /** A new owner: the code was right, the restaurant needs a name. */
  | { step: "name"; email: Email }
  | { step: "done"; session: DeviceSession };

export type SignInProblem = SignInError | "badEmail" | "noName" | "nameTooLong";

export type SignIn = {
  flow: SignInStep;
  email: string;
  code: string;
  name: string;
  busy: boolean;
  problem?: SignInProblem;
  typeEmail(text: string): void;
  sendCode(): Promise<void>;
  /** Signs in by itself once the sixth digit is in. */
  typeCode(text: string): void;
  resend(): Promise<void>;
  changeEmail(): void;
  typeName(text: string): void;
  finish(): Promise<void>;
};

/** Email → code → (a new owner) the restaurant's name. */
export function useSignIn(): SignIn {
  const { account, clock } = usePorts();
  const [flow, setFlow] = useState<SignInStep>({ step: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<SignInProblem>();
  // useState is too late for a second tap in the same frame.
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  /** Runs one request at a time; drops its answer if the sheet went away meanwhile. */
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
      if (!controller.signal.aborted) setProblem("failed");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const ask = (to: Email) =>
    once(async (signal) => {
      const result = await account.requestCode(to, signal);
      if (signal.aborted) return;
      // "Too soon" means a code already on its way: go and type that one.
      let wait: number;
      if (result.ok) wait = result.value.resendIn;
      else if (result.error.kind === "tooSoon") wait = result.error.retryIn;
      else return setProblem(result.error.kind);
      setCode("");
      setFlow({ step: "code", email: to, resendAt: clock.now() + wait * 1000 });
    });

  const verify = (to: Email, digits: string, restaurantName?: string) =>
    once(async (signal) => {
      const result = await account.signIn(to, digits, restaurantName, signal);
      if (signal.aborted) return;
      if (!result.ok) {
        setProblem(result.error);
        if (result.error === "wrongCode") setCode("");
        return;
      }
      setFlow(result.value.kind === "needsName" ? { step: "name", email: to } : { step: "done", session: result.value.session });
    });

  return {
    flow,
    email,
    code,
    name,
    busy,
    problem,
    typeEmail(text) {
      setEmail(text);
      setProblem(undefined);
    },
    async sendCode() {
      const read = readEmail(email);
      if (!read.ok) return setProblem("badEmail");
      await ask(read.value);
    },
    typeCode(text) {
      if (flow.step !== "code") return;
      const digits = codeDigits(text);
      setCode(digits);
      if (digits.length < CODE_LENGTH) return setProblem(undefined);
      void verify(flow.email, digits);
    },
    async resend() {
      if (flow.step !== "code" || clock.now() < flow.resendAt) return;
      await ask(flow.email);
    },
    changeEmail() {
      if (inFlight.current) return;
      setFlow({ step: "email" });
      setCode("");
      setProblem(undefined);
    },
    typeName(text) {
      setName(text);
      setProblem(undefined);
    },
    async finish() {
      if (flow.step !== "name") return;
      const read = readRestaurantName(name);
      if (!read.ok) return setProblem(read.error === "empty" ? "noName" : "nameTooLong");
      await verify(flow.email, code, read.value);
    },
  };
}

/** Who this device is signed in as: undefined while reading, null when nobody. */
export function useDeviceSession(): DeviceSession | null | undefined {
  const { account } = usePorts();
  const [session, setSession] = useState<DeviceSession | null>();
  useEffect(() => account.subscribe(setSession), [account]);
  return session;
}
