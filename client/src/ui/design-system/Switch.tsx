type Props = { checked: boolean; onChange: (checked: boolean) => void; label: string };

export function Switch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => onChange(!checked)}
      // The 44px hit area wraps a 51×31 track.
      className="flex min-h-11 min-w-14 shrink-0 items-center justify-center"
    >
      <span
        className={`relative h-[31px] w-[51px] rounded-full transition-colors ${checked ? "bg-success" : "bg-surface-2 ring-1 ring-line ring-inset"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}
