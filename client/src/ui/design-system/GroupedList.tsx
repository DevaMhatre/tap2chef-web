import type { ComponentProps, ReactNode } from "react";

type SectionProps = {
  header?: ReactNode;
  /** Right side of the header, e.g. an Edit button. */
  headerAction?: ReactNode;
  footer?: ReactNode;
  id?: string;
  children: ReactNode;
};

// Grouped inset list: a quiet header, rows on one rounded surface.
export function ListSection({ header, headerAction, footer, id, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-32">
      {(header || headerAction) && (
        <div className="flex min-h-11 items-center justify-between gap-2 px-4">
          <h2 className="truncate text-[13px] font-semibold tracking-wide text-muted uppercase">{header}</h2>
          {headerAction}
        </div>
      )}
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] text-muted">{footer}</p>}
    </section>
  );
}

type RowProps = Omit<ComponentProps<"button">, "children"> & {
  leading?: ReactNode;
  trailing?: ReactNode;
  /** A quiet second line under the title. */
  detail?: ReactNode;
  children: ReactNode;
};

export function ListRow({ leading, trailing, detail, children, className = "", ...props }: RowProps) {
  return (
    <button
      type="button"
      className={`flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-[17px] transition-colors active:bg-surface-2 ${className}`}
      {...props}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {detail && <span className="block truncate text-[13px] text-muted">{detail}</span>}
      </span>
      {trailing}
    </button>
  );
}

export function ListNote({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3 text-[15px] text-muted">{children}</div>;
}
