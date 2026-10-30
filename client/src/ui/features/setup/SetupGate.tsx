import type { ReactNode } from "react";
import { useNeedsSetup } from "../../../usecases/useSetup";
import { SetupFlow } from "./SetupFlow";

// A phone that starts empty is set up before anything else shows; every
// other phone goes straight to work.
export function SetupGate({ children }: { children: ReactNode }) {
  const needsSetup = useNeedsSetup();
  // Reading the phone's own storage takes a few milliseconds: show nothing
  // rather than flash the wrong screen.
  if (needsSetup === undefined) return null;
  return needsSetup ? <SetupFlow /> : children;
}
