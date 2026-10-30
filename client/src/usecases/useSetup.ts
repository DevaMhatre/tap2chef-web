import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { err, ok, type Result } from "../domain/result";
import {
  firstPriceListName,
  readDishRows,
  readService,
  stepAfterService,
  type DishRow,
  type DishRowError,
  choiceOf,
  type Service,
  type ServiceChoice,
  type SetupProgress,
  type ShopDetails,
} from "../domain/setup";
import { readRestaurantName } from "../domain/signIn";
import { TABLE_COUNT } from "../domain/tables";
import { STARTER_MENUS, type StarterMenu } from "../domain/starterMenus";
import { createMenuEditor } from "./menuEditor";
import type { LocalSetup, MenuSnapshot } from "./ports";
import { usePorts } from "./PortsProvider";
import { useSignIn, type SignIn } from "./useSignIn";
import { useTables } from "./useTables";

export type { ServiceChoice };

/** One question per screen. Every answer is saved as it is given. */
export type Setup =
  | { step: "loading" }
  /** Set up, or a phone that had records before setup existed. */
  | { step: "done" }
  | {
      step: "account";
      signIn: SignIn;
      /** Offline, signing in can't work now: setting up still can. */
      online: boolean;
      /** Set up now, sign in later: the account attaches when there's internet. */
      later(): Promise<void>;
    }
  | {
      step: "name";
      name: string;
      problem?: "noName" | "nameTooLong";
      busy: boolean;
      typeName(text: string): void;
      next(): Promise<void>;
    }
  | {
      step: "service";
      choice: ServiceChoice;
      problem?: "none";
      /** Chooses only; `next` commits. */
      toggle(kind: keyof ServiceChoice): void;
      next(): Promise<void>;
      back(): Promise<void>;
    }
  | { step: "tables"; suggestedCount: number; setUp(count: number): Promise<void>; back(): Promise<void> }
  | {
      step: "menu";
      starters: readonly StarterMenu[];
      /** Adds the priced rows and moves on; nothing is written while any row is wrong. */
      addDishes(rows: readonly DishRow[]): Promise<Result<number, Record<string, DishRowError>>>;
      later(): Promise<void>;
      back(): Promise<void>;
    }
  | { step: "ready"; name: string; service: Service; tables: number; dishes: number; start(): Promise<void> };

const NO_CHOICE: ServiceChoice = { dineIn: false, takeaway: false };

/**
 * What this phone remembers of its setup. On first look it decides, once and
 * for good, whether the phone needs the setup: a phone that already holds
 * records (or was signed in) never does, even once the setup's own records
 * would make an empty one look used.
 */
export function useLocalSetup(): LocalSetup | undefined {
  const { setup: store } = usePorts();
  const [local, setLocal] = useState<LocalSetup>();
  useEffect(() => store.subscribe(setLocal), [store]);
  const begun = Boolean(local?.progress);
  useEffect(() => {
    if (local === undefined || begun) return;
    void store.isEmptyDevice().then((empty) => store.begin(empty ? { step: "account" } : { step: "done" }));
  }, [local, begun, store]);
  return local;
}

/** Whether to show the setup instead of the app: undefined while reading. */
export function useNeedsSetup(): boolean | undefined {
  const progress = useLocalSetup()?.progress;
  return progress ? progress.step !== "done" : undefined;
}

/** A new owner's setup: email, name, how customers order, tables, the menu. */
export function useSetup(): Setup {
  const { setup: store, shop, menu, ids, network } = usePorts();
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const signIn = useSignIn();
  const tables = useTables();
  const editor = useMemo(() => createMenuEditor(menu, ids), [menu, ids]);

  const local = useLocalSetup();
  const [details, setDetails] = useState<ShopDetails | null>();
  const [snapshot, setSnapshot] = useState<MenuSnapshot>();
  const [name, setName] = useState("");
  const [nameProblem, setNameProblem] = useState<"noName" | "nameTooLong">();
  const [choice, setChoice] = useState<ServiceChoice>();
  const [serviceProblem, setServiceProblem] = useState<"none">();
  const [busy, setBusy] = useState(false);
  // useState is too late for a second tap in the same frame.
  const inFlight = useRef(false);

  useEffect(() => shop.subscribe(setDetails), [shop]);
  useEffect(() => editor.subscribe(setSnapshot), [editor]);

  const progress = local?.progress;

  // The code is right: a known owner has a restaurant already; a new one names theirs next.
  const signedInAs = signIn.flow.step;
  useEffect(() => {
    if (progress?.step !== "account") return;
    if (signedInAs === "done") void store.save({ step: "done" });
    if (signedInAs === "name") void store.save({ step: "name" });
  }, [progress?.step, signedInAs, store]);

  async function once(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const go = (next: SetupProgress) => store.save(next);

  if (!progress || details === undefined || !snapshot || tables.state === "loading") return { step: "loading" };
  const service = details?.service ?? "both";

  switch (progress.step) {
    case "done":
      return { step: "done" };

    case "account":
      return { step: "account", signIn, online, later: () => once(() => go({ step: "name" })) };

    case "name":
      return {
        step: "name",
        name,
        problem: nameProblem,
        busy,
        typeName(text) {
          setName(text);
          setNameProblem(undefined);
        },
        next: () =>
          once(async () => {
            const read = readRestaurantName(name);
            if (!read.ok) return setNameProblem(read.error === "empty" ? "noName" : "nameTooLong");
            // A new owner's account is made with the name. If that fails now
            // (no internet, the code expired), setup carries on and the
            // account attaches later, already knowing the name.
            if (signIn.flow.step === "name") await signIn.finish(read.value);
            await go({ step: "service", name: read.value });
          }),
      };

    case "service": {
      const shown = choice ?? (details ? choiceOf(details.service) : NO_CHOICE);
      return {
        step: "service",
        choice: shown,
        problem: serviceProblem,
        toggle(kind) {
          setChoice({ ...shown, [kind]: !shown[kind] });
          setServiceProblem(undefined);
        },
        next: () =>
          once(async () => {
            const read = readService(shown);
            if (!read.ok) return setServiceProblem(read.error);
            await shop.write({ name: progress.name, service: read.value });
            const next = stepAfterService(read.value);
            // Back here after the tables were made: they are not asked again.
            await go(next.step === "tables" && tables.state === "ready" ? { step: "menu" } : next);
          }),
        back: () =>
          once(async () => {
            setName(progress.name);
            await go({ step: "name" });
          }),
      };
    }

    case "tables":
      return {
        step: "tables",
        suggestedCount: TABLE_COUNT.suggested,
        setUp: (count) =>
          once(async () => {
            if (tables.state === "empty") {
              const result = await tables.setUp(count);
              if (!result.ok) return;
            }
            await go({ step: "menu" });
          }),
        back: () => once(() => go({ step: "service", name: details?.name ?? name })),
      };

    case "menu":
      return {
        step: "menu",
        starters: STARTER_MENUS,
        async addDishes(rows) {
          const read = readDishRows(rows);
          if (!read.ok) return err(read.error);
          if (read.value.length === 0) return ok(0);
          await once(async () => {
            await editor.commands.addDishes(read.value, firstPriceListName(service));
            await go({ step: "ready" });
          });
          return ok(read.value.length);
        },
        later: () => once(() => go({ step: "ready" })),
        back: () =>
          once(() => go(service === "takeaway" ? { step: "service", name: details?.name ?? name } : { step: "tables" })),
      };

    case "ready":
      return {
        step: "ready",
        name: details?.name ?? name,
        service,
        tables: tables.state === "ready" ? tables.floor.length : 0,
        dishes: snapshot.items.length,
        start: () => once(() => go({ step: "done" })),
      };
  }
}
