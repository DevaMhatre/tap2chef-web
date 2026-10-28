import { MdAdd, MdDeleteOutline, MdRemove } from "react-icons/md";

type Props = {
  value: number;
  /** What is being counted, for screen readers: "Roti". */
  label: string;
  onStep: (by: 1 | -1) => void;
  min?: number;
  max?: number;
  /** At the minimum, minus becomes a bin: one more tap removes the thing. */
  removable?: boolean;
};

const button =
  "flex min-h-11 min-w-11 items-center justify-center text-xl text-primary transition-transform active:scale-90 disabled:text-line";

export function Stepper({ value, label, onStep, min = 1, max = 99, removable }: Props) {
  const removes = removable && value <= min;
  return (
    <div className="flex shrink-0 items-center rounded-full bg-surface-2">
      <button
        type="button"
        className={button}
        aria-label={removes ? `Remove ${label}` : `One fewer ${label}`}
        disabled={!removes && value <= min}
        onClick={() => onStep(-1)}
      >
        {removes ? <MdDeleteOutline /> : <MdRemove />}
      </button>
      <span aria-live="polite" className="min-w-6 text-center text-[17px] font-semibold tabular-nums">
        {value}
      </span>
      <button type="button" className={button} aria-label={`One more ${label}`} disabled={value >= max} onClick={() => onStep(1)}>
        <MdAdd />
      </button>
    </div>
  );
}
