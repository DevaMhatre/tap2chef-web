import type { ReactNode } from "react";

type Props<T extends string> = {
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  /** null = nothing chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
  invalid?: boolean;
};

export function SegmentedControl<T extends string>({ label, options, value, onChange, invalid }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={`flex rounded-xl bg-surface-2 p-1 ${invalid ? "ring-2 ring-primary" : ""}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[15px] font-semibold transition-colors ${
              selected ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
