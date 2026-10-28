import { useState } from "react";
import { MdAdd, MdRemove, MdTableRestaurant } from "react-icons/md";
import { TABLE_COUNT } from "../../../domain/tables";
import type { Tables } from "../../../usecases/useTables";
import { Button } from "../../design-system/Button";
import { haptic } from "../../design-system/haptic";

type Props = Extract<Tables, { state: "empty" }>;

const stepClass =
  "flex min-h-14 min-w-14 items-center justify-center text-2xl text-primary transition-transform active:scale-90 disabled:text-line";

// Setup is one question. No floor plan to draw: the owner already knows
// where table 4 is.
export function TableSetup({ suggestedCount, setUp }: Props) {
  const [count, setCount] = useState(suggestedCount);
  const [text, setText] = useState(`${suggestedCount}`);
  const set = (n: number) => {
    setCount(n);
    setText(`${n}`);
  };

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center text-center">
      <MdTableRestaurant className="mb-4 text-6xl text-primary" aria-hidden />
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">How many tables?</h1>
      <p className="mt-2 mb-6 text-[17px] text-muted">They&rsquo;re numbered 1, 2, 3&hellip; Rename or add more any time.</p>

      <div className="mb-6 flex items-center rounded-full bg-surface-2">
        <button type="button" aria-label="One fewer table" disabled={count <= TABLE_COUNT.min} onClick={() => set(count - 1)} className={stepClass}>
          <MdRemove />
        </button>
        <input
          aria-label="Number of tables"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
            setText(digits);
            const n = Number(digits);
            if (n >= TABLE_COUNT.min && n <= TABLE_COUNT.max) setCount(n);
          }}
          onBlur={() => setText(`${count}`)}
          className="min-h-14 w-20 bg-transparent text-center text-[34px] font-bold tabular-nums outline-none"
        />
        <button type="button" aria-label="One more table" disabled={count >= TABLE_COUNT.max} onClick={() => set(count + 1)} className={stepClass}>
          <MdAdd />
        </button>
      </div>

      <Button
        className="w-full"
        onClick={async () => {
          const result = await setUp(count);
          if (result.ok) haptic();
        }}
      >
        Set Up {count} {count === 1 ? "Table" : "Tables"}
      </Button>
    </section>
  );
}
