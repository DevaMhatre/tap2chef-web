import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useShopDetails } from "../../../usecases/ShopProvider";
import { useNeedsSetup } from "../../../usecases/useSetup";
import { JoinFlow } from "./JoinFlow";
import { SetupFlow } from "./SetupFlow";

// A phone that starts empty is set up before anything else shows; every
// other phone goes straight to work.
export function SetupGate({ children }: { children: ReactNode }) {
  const needsSetup = useNeedsSetup();
  const details = useShopDetails();
  // A scanned code (/join#482913) or "Joining a restaurant?": before anything else.
  const { pathname, hash } = useLocation();
  if (pathname === "/join") return <JoinFlow linkCode={hash} />;
  // Reading the phone's own storage takes a few milliseconds: show nothing
  // rather than flash the wrong screen, or tabs that are about to change.
  if (needsSetup === undefined || details === undefined) return null;
  return needsSetup ? <SetupFlow /> : children;
}
