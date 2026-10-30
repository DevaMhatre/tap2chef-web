import { useSyncExternalStore } from "react";
import { showsTables } from "../domain/setup";
import { usePorts } from "./PortsProvider";
import { useShopDetails } from "./ShopProvider";
import { useLocalSetup } from "./useSetup";
import { useDeviceSession } from "./useSignIn";

export { useShopDetails } from "./ShopProvider";

/**
 * Whether the app shows tables: not for a kitchen whose customers only take
 * their food away. Undefined while reading.
 */
export function useShowsTables(): boolean | undefined {
  const details = useShopDetails();
  return details === undefined ? undefined : showsTables(details);
}

/**
 * The name the header shows. A restaurant signed up before setup existed has
 * its name only in the account.
 */
export function useRestaurantName(): string | undefined {
  const details = useShopDetails();
  const session = useDeviceSession();
  return details?.name ?? session?.restaurantName;
}

export type SafeCopyCard = { show: boolean; dismiss(): void };

/**
 * Once, on a phone that works without an account (it had records before
 * setup existed, or was set up offline): "keep a copy safe". Shown only with
 * internet, when tapping it can work; put away, it never returns, and the
 * saved pill stays the way in.
 */
export function useSafeCopyCard(): SafeCopyCard {
  const { setup, network } = usePorts();
  const session = useDeviceSession();
  const local = useLocalSetup();
  const online = useSyncExternalStore(network.subscribe, network.isOnline);

  const show = local?.progress?.step === "done" && !local.cardDismissed && session === null && online;
  return { show, dismiss: () => void setup.dismissCard() };
}
