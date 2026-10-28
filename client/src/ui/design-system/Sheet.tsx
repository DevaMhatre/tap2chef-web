import { useEffect, useRef, useState, type ReactNode } from "react";

// How much of the layout the on-screen keyboard covers. Android shrinks the
// page itself (interactive-widget=resizes-content), so this stays 0 there;
// iOS Safari lays the keyboard over the page, so the sheet has to rise by it.
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The sheet's one primary action, top right (e.g. Save, Done). */
  action?: ReactNode;
  /** Top left; defaults to Cancel. null hides it (the action closes the sheet). */
  dismissLabel?: string | null;
  children: ReactNode;
};

// A native <dialog>: focus trapping, Escape, and an inert page behind it come
// from the browser. Slides up from the bottom on phones; centred on wider screens.
export function Sheet({ open, onClose, title, action, dismissLabel = "Cancel", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const keyboard = useKeyboardInset(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      // A tap on the dimmed backdrop lands on the dialog element itself.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      style={keyboard > 0 ? { marginBottom: keyboard, maxHeight: `calc(100dvh - ${keyboard}px - 1rem)` } : undefined}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none animate-[sheet-up_320ms_cubic-bezier(0.32,0.72,0,1)] overflow-hidden rounded-t-3xl bg-bg p-0 text-ink backdrop:animate-[fade-in_200ms] backdrop:bg-scrim md:m-auto md:max-w-lg md:animate-[fade-in_180ms] md:rounded-3xl"
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-2">
            {dismissLabel === null ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 justify-self-start rounded-xl px-3 text-[17px] text-primary"
              >
                {dismissLabel}
              </button>
            )}
            <h2 className="truncate text-[17px] font-semibold">{title}</h2>
            <div className="justify-self-end">{action}</div>
          </header>
          <div className="overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
