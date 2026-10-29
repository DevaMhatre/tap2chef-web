import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePorts } from "./PortsProvider";

/** How often a signed-in device on screen asks for others' changes. */
export const PULL_EVERY_MS = 3000;
/** How soon a change made here is sent: soon enough for the counter, late enough to batch a burst of taps. */
export const PUSH_AFTER_MS = 300;

/** Where this device's work is kept right now. */
export type Kept = "device" | "online";

/**
 * Keeps a signed-in device in step with its account: sends what changes here,
 * brings what changes elsewhere. Never blocks anything; offline it waits.
 */
export function useSync(signedIn: boolean): Kept {
  const { sync, network, visibility } = usePorts();
  const online = useSyncExternalStore(network.subscribe, network.isOnline);
  const visible = useSyncExternalStore(visibility.subscribe, visibility.isVisible);
  const [waiting, setWaiting] = useState(0);
  const [inStep, setInStep] = useState(false);
  const running = useRef(false);
  const again = useRef(false);
  const runNow = useRef<(() => Promise<void>) | undefined>(undefined);
  const active = signedIn && online && visible;

  useEffect(() => sync.subscribeWaiting(setWaiting), [sync]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    // One run at a time; a change during a run gets one more run after it.
    async function run() {
      if (running.current) {
        again.current = true;
        return;
      }
      running.current = true;
      try {
        do {
          again.current = false;
          const result = await sync.run(controller.signal);
          if (controller.signal.aborted) return;
          setInStep(result.ok);
        } while (again.current);
      } catch {
        if (!controller.signal.aborted) setInStep(false);
      } finally {
        running.current = false;
      }
    }

    void run();
    const timer = setInterval(run, PULL_EVERY_MS);
    runNow.current = run;
    return () => {
      clearInterval(timer);
      controller.abort();
      runNow.current = undefined;
      running.current = false;
      setInStep(false);
    };
  }, [active, sync]);

  useEffect(() => {
    if (!active || waiting === 0) return;
    const timer = setTimeout(() => void runNow.current?.(), PUSH_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active, waiting]);

  return signedIn && inStep && waiting === 0 ? "online" : "device";
}
