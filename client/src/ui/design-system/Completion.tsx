import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MdCheck } from "react-icons/md";

export type Moment = { title: string; detail: string; /** The one thing to do next, e.g. "Hand back ₹200". */ emphasis?: string };
type Show = (moment: Moment, then?: () => void) => void;

const CompletionContext = createContext<Show | null>(null);
const VISIBLE_MS = 1200;

// The end of a job deserves a moment: a check that springs in, what was done,
// then out of the way. It sits above every screen, so whatever happens
// underneath — a navigation, a screen that changes — can't cut it short.
// Tap anywhere to move on sooner.
export function CompletionProvider({ children }: { children: ReactNode }) {
  const [moment, setMoment] = useState<(Moment & { key: number }) | null>(null);
  const then = useRef<(() => void) | undefined>(undefined);

  const finish = useCallback(() => {
    setMoment(null);
    const next = then.current;
    then.current = undefined;
    next?.();
  }, []);

  const show = useCallback<Show>((next, after) => {
    then.current = after;
    setMoment({ ...next, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(finish, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [moment, finish]);

  return (
    <CompletionContext.Provider value={show}>
      {children}
      {moment && (
        <div
          key={moment.key}
          role="status"
          aria-live="assertive"
          onClick={finish}
          className="fixed inset-0 z-40 flex animate-[fade-in_160ms] items-center justify-center bg-scrim px-6"
        >
          <div className="flex w-full max-w-xs flex-col items-center rounded-3xl bg-bg px-6 py-8 text-center text-ink shadow-lg">
            <span className="flex h-24 w-24 animate-[settle-in_520ms_cubic-bezier(0.34,1.56,0.64,1)] items-center justify-center rounded-full bg-success text-6xl text-white">
              <MdCheck aria-hidden />
            </span>
            <p className="mt-5 text-[22px] font-bold">{moment.title}</p>
            <p className="mt-1 text-[17px] text-muted tabular-nums">{moment.detail}</p>
            {moment.emphasis && <p className="mt-3 text-[20px] font-bold text-success tabular-nums">{moment.emphasis}</p>}
          </div>
        </div>
      )}
    </CompletionContext.Provider>
  );
}

export function useCompletion(): Show {
  const show = useContext(CompletionContext);
  if (!show) throw new Error("useCompletion must be used inside <CompletionProvider>");
  return show;
}
