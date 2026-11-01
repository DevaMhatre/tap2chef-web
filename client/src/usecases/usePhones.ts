import { useCallback, useEffect, useRef, useState } from "react";
import { MANAGES_ANSWER, type PhonePerson } from "../domain/access";
import { normalizeName } from "../domain/menu";
import { ownerFirst, type Phone } from "../domain/phones";
import { isOwnerPhone } from "../domain/signIn";
import type { PhonesError } from "./ports";
import { usePorts } from "./PortsProvider";
import { useDeviceSession } from "./useSignIn";

/** An abortable call's rejection when its screen went away: expected, and nothing to do. */
const unlessAborted = (signal: AbortSignal) => (error: unknown) => {
  if (!signal.aborted) throw error;
};

/** How often the lists ask again while open: a joining phone shows within seconds. */
export const PHONES_POLL_MS = 3000;

export type Phones =
  /** Not the owner's own phone: phones are none of its business. */
  | { state: "hidden" }
  | { state: "loading" }
  | { state: "unavailable"; problem: PhonesError }
  | { state: "ready"; phones: Phone[] };

/** The restaurant's phones, for the owner's own phone. Mount it when the sheet opens. */
export function usePhones(): Phones {
  const { phones: service } = usePorts();
  const session = useDeviceSession();
  const owner = isOwnerPhone(session);
  const [list, setList] = useState<Phone[]>();
  const [problem, setProblem] = useState<PhonesError>();

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    void service
      .list(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) setList(ownerFirst(result.value));
        else setProblem(result.error);
      })
      .catch(unlessAborted(controller.signal));
    return () => controller.abort();
  }, [owner, service]);

  if (session === undefined) return { state: "loading" };
  if (!owner) return { state: "hidden" };
  if (problem) return { state: "unavailable", problem };
  if (!list) return { state: "loading" };
  return { state: "ready", phones: list };
}

/** Removes a phone for good; true once the server has it. One at a time, however fast the button is tapped. */
export function useRemovePhone(): (id: string) => Promise<boolean> {
  const { phones: service } = usePorts();
  const removing = useRef(new Set<string>());
  return async (id) => {
    if (removing.current.has(id)) return false;
    removing.current.add(id);
    try {
      return (await service.remove(id)).ok;
    } finally {
      removing.current.delete(id);
    }
  };
}

export type AddPhone =
  /** Who the phone is for, first: it joins as them. */
  | {
      state: "who";
      name: string;
      /** "Can they handle money and the menu when you're away?" Unanswered: null. */
      manages: boolean | null;
      problem?: "noName" | "nameTooLong" | "noAnswer";
      typeName(text: string): void;
      /** Chooses only; `showCode` commits. */
      answer(manages: boolean): void;
      showCode(): void;
    }
  | { state: "loading" }
  | { state: "unavailable"; problem: PhonesError }
  /** Show the code (and its link as a QR) until a phone joins; a new one comes when it expires. */
  | { state: "showing"; person: string; code: string; expiresAt: number }
  | { state: "joined"; person: string; label: string };

export const PERSON_NAME_MAX = 40;

/** The owner says who the new phone is for, shows a code, and hears the moment it joins. */
export function useAddPhone(): AddPhone {
  const { phones: service, clock } = usePorts();
  const [name, setName] = useState("");
  const [manages, setManages] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<"noName" | "nameTooLong" | "noAnswer">();
  const [person, setPerson] = useState<PhonePerson>();
  const [shown, setShown] = useState<Exclude<AddPhone, { state: "who" }>>({ state: "loading" });
  const known = useRef<Set<string>>(undefined);

  const fetchCode = useCallback(
    (who: PhonePerson, signal: AbortSignal) =>
      service
        .linkCode(who, signal)
        .then((result) => {
          if (signal.aborted) return;
          setShown(result.ok ? { state: "showing", person: who.name, ...result.value } : { state: "unavailable", problem: result.error });
        })
        .catch(unlessAborted(signal)),
    [service],
  );

  useEffect(() => {
    if (!person) return;
    const controller = new AbortController();
    void service
      .list(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result.ok) known.current = new Set(result.value.map((p) => p.id));
      })
      .catch(unlessAborted(controller.signal));
    void fetchCode(person, controller.signal);
    return () => controller.abort();
  }, [person, service, fetchCode]);

  // While the code shows: watch for the new phone, and replace a code that ran out.
  const showing = shown.state === "showing" ? shown : undefined;
  useEffect(() => {
    if (!showing || !person) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (clock.now() >= showing.expiresAt) {
        void fetchCode(person, controller.signal);
        return;
      }
      void service
        .list(controller.signal)
        .then((result) => {
          if (controller.signal.aborted || !result.ok || !known.current) return;
          const fresh = result.value.find((p) => p.kind === "linked" && !known.current!.has(p.id));
          if (fresh) setShown({ state: "joined", person: person.name, label: fresh.label });
        })
        .catch(unlessAborted(controller.signal));
    }, PHONES_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [showing, person, clock, service, fetchCode]);

  if (!person) {
    return {
      state: "who",
      name,
      manages,
      problem,
      typeName(text) {
        setName(text);
        setProblem(undefined);
      },
      answer(value) {
        setManages(value);
        setProblem(undefined);
      },
      showCode() {
        const typed = normalizeName(name);
        if (typed === "") return setProblem("noName");
        if (typed.length > PERSON_NAME_MAX) return setProblem("nameTooLong");
        if (manages === null) return setProblem("noAnswer");
        setPerson({ name: typed, roleId: manages ? MANAGES_ANSWER.yes : MANAGES_ANSWER.no });
      },
    };
  }
  return shown;
}
