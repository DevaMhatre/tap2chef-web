import { useRef, useState } from "react";
import { choiceOf, readService, takeawayIsMain, type ServiceChoice } from "../domain/setup";
import { readRestaurantName } from "../domain/signIn";
import { usePorts } from "./PortsProvider";
import { useShopDetails } from "./ShopProvider";
import { useDeviceSession } from "./useSignIn";

export type RestaurantDetailsProblem = "noName" | "nameTooLong" | "noService";

export type RestaurantDetails =
  | { state: "loading" }
  | {
      state: "ready";
      name: string;
      choice: ServiceChoice;
      /** A phone linked with a code sees these but can't change them: only the owner's phone does. */
      canEdit: boolean;
      problem?: RestaurantDetailsProblem;
      /** Something differs from what is stored: Save has something to do. */
      changed: boolean;
      typeName(text: string): void;
      /** Chooses only; `save` commits. */
      toggle(kind: keyof ServiceChoice): void;
      /** True once saved; the app reshapes at once. */
      save(): Promise<boolean>;
    };

/**
 * The owner changes what they told the setup: the name, how customers order.
 * The form starts from what is stored, or, for a restaurant set up before the
 * setup existed, from its account's name and both ways of ordering, which is
 * how it behaves. Mount it when the sheet opens.
 */
export function useRestaurantDetails(): RestaurantDetails {
  const { shop } = usePorts();
  const details = useShopDetails();
  const session = useDeviceSession();
  const [typed, setTyped] = useState<{ name?: string; choice?: ServiceChoice }>({});
  const [problem, setProblem] = useState<RestaurantDetailsProblem>();
  // useState is too late for a second tap in the same frame.
  const saving = useRef(false);

  if (details === undefined || session === undefined) return { state: "loading" };
  const stored = details ?? { name: session?.restaurantName ?? "", service: "both" as const };
  const name = typed.name ?? stored.name;
  const choice = typed.choice ?? choiceOf(stored.service);
  const service = readService(choice);
  const canEdit = session?.via !== "link";
  const changed = canEdit && (name.trim() !== stored.name || !service.ok || service.value !== stored.service || details === null);

  return {
    state: "ready",
    name,
    choice,
    canEdit,
    problem,
    changed,
    typeName(text) {
      setTyped((t) => ({ ...t, name: text }));
      setProblem(undefined);
    },
    toggle(kind) {
      setTyped((t) => ({ ...t, choice: { ...choice, [kind]: !choice[kind] } }));
      setProblem(undefined);
    },
    async save() {
      if (!canEdit) return false;
      const readName = readRestaurantName(name);
      if (!readName.ok) {
        setProblem(readName.error === "empty" ? "noName" : "nameTooLong");
        return false;
      }
      if (!service.ok) {
        setProblem("noService");
        return false;
      }
      if (saving.current) return false;
      saving.current = true;
      try {
        await shop.write({ name: readName.value, service: service.value });
        return true;
      } finally {
        saving.current = false;
      }
    },
  };
}

/** Whether "+ Takeaway" is the screen's main action. */
export function useTakeawayIsMain(): boolean {
  return takeawayIsMain(useShopDetails() ?? null);
}
