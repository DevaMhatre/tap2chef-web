import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Toast = { key: number; message: string; undo: () => void };
type Show = (message: string, undo: () => void) => void;

const ToastContext = createContext<Show | null>(null);
const VISIBLE_MS = 5000;

// Forgiveness instead of confirmation: destructive actions happen at once and
// can be taken back for a few seconds.
export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback<Show>((message, undo) => setToast({ key: Date.now(), message, undo }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6"
      >
        {toast && (
          <div
            key={toast.key}
            className="pointer-events-auto flex w-full max-w-sm animate-[toast-in_220ms_ease-out] items-center gap-3 rounded-2xl bg-ink py-1.5 pr-1.5 pl-4 text-bg shadow-lg"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]">{toast.message}</span>
            <button
              type="button"
              onClick={() => {
                toast.undo();
                setToast(null);
              }}
              className="min-h-11 rounded-xl px-4 text-[15px] font-semibold text-primary"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useUndoToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useUndoToast must be used inside <UndoToastProvider>");
  return show;
}
