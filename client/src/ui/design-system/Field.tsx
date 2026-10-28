import { useId, type ComponentProps, type ReactNode } from "react";

const control =
  "min-h-11 w-full rounded-xl px-3 text-[17px] text-ink outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-ink/20 aria-invalid:ring-2 aria-invalid:ring-primary";

function Label({ htmlFor, hidden, children }: { htmlFor: string; hidden?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={hidden ? "sr-only" : "mb-1.5 block px-1 text-[13px] font-semibold text-muted"}>
      {children}
    </label>
  );
}

export function FieldError({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 px-1 text-[13px] font-medium text-primary">
      {children}
    </p>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "prefix"> & {
  label: string;
  error?: string;
  /** Shown inside the field before the text, e.g. ₹. */
  prefix?: string;
  /** For screen readers only, when the row around the field already says what it is. */
  labelHidden?: boolean;
  /** Quiet guidance under the field; an error replaces it. */
  hint?: string;
  /** Inside a list row, whose surface would otherwise hide the field's edge. */
  inset?: boolean;
};

// 17px text: below 16px iOS zooms the page when the field is focused.
export function TextField({ label, error, prefix, labelHidden, hint, inset, id, className = "", ...input }: TextFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      <Label htmlFor={inputId} hidden={labelHidden}>
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[17px] text-muted">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${control} ${inset ? "bg-surface-2" : "bg-surface"} ${prefix ? "pl-7 tabular-nums" : ""}`}
          {...input}
        />
      </div>
      <FieldError id={errorId}>{error}</FieldError>
      {hint && !error && <p className="mt-1.5 px-1 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

type SelectFieldProps = ComponentProps<"select"> & { label: string; error?: string };

export function SelectField({ label, error, id, className = "", children, ...select }: SelectFieldProps) {
  const fallbackId = useId();
  const selectId = id ?? fallbackId;
  return (
    <div className={className}>
      <Label htmlFor={selectId}>{label}</Label>
      <select id={selectId} aria-invalid={error ? true : undefined} className={`${control} appearance-none bg-surface`} {...select}>
        {children}
      </select>
      <FieldError>{error}</FieldError>
    </div>
  );
}
