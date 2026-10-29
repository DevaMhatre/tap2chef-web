import { useState } from "react";
import { MdAdd, MdPayments } from "react-icons/md";
import { spent, type Expense, type ExpenseId } from "../../domain/expense";
import { useExpenses } from "../../usecases/useExpenses";
import { Button } from "../design-system/Button";
import { ListRow, ListSection } from "../design-system/GroupedList";
import { PageHeader } from "../design-system/PageHeader";
import { ExpenseSheet } from "../features/expenses/ExpenseSheet";
import { RemoveSheet } from "../features/expenses/RemoveSheet";
import { METHOD_LABEL } from "../features/order/labels";
import { dayLabel, formatPrice, formatTime } from "../format";

// What went out, day by day: today first, then earlier days that have
// something noted. A tap opens an expense to take it off.
export default function ExpensesPage() {
  const screen = useExpenses();
  // Visual-only state: which sheet is open.
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<ExpenseId | null>(null);

  if (screen.state === "loading") return <PageHeader title="Expenses" />;

  const [today, ...earlier] = screen.days;
  const nothingToday = today!.expenses.length === 0;
  const viewed = screen.days.flatMap((d) => d.expenses).find((e) => e.id === viewing) ?? null;

  const row = (expense: Expense) => {
    const live = spent(expense);
    return (
      <ListRow
        key={expense.id}
        className={live ? "" : "text-muted"}
        detail={live ? `${METHOD_LABEL[expense.method]} · ${formatTime(expense.recordedAt)}` : `Removed ${formatTime(expense.removedAt!)}`}
        trailing={<span className={`shrink-0 text-[17px] tabular-nums ${live ? "font-semibold" : "line-through"}`}>{formatPrice(expense.amount)}</span>}
        onClick={() => setViewing(expense.id)}
      >
        <span className={live ? "" : "line-through"}>{expense.note}</span>
      </ListRow>
    );
  };
  const section = (day: (typeof screen.days)[number]) => (
    <ListSection
      key={day.day}
      header={`${dayLabel(day.day, screen.today)}${day.spent.total > 0 ? ` · ${formatPrice(day.spent.total)}` : ""}`}
      footer={day.spent.total > 0 ? `Cash ${formatPrice(day.spent.cash)} · UPI ${formatPrice(day.spent.upi)}` : undefined}
    >
      {day.expenses.map(row)}
    </ListSection>
  );

  return (
    <section className="mx-auto max-w-3xl">
      <PageHeader
        title="Expenses"
        actions={
          <Button onClick={() => setAdding(true)}>
            <MdAdd className="-ml-1 text-xl" /> Expense
          </Button>
        }
      />
      <div className="space-y-6">
        {nothingToday ? (
          <div className={`flex flex-col items-center justify-center text-center ${earlier.length > 0 ? "py-12" : "min-h-[50dvh]"}`}>
            <MdPayments className="mb-3 text-5xl text-muted/60" aria-hidden />
            <p className="text-[17px] font-semibold">Nothing spent today</p>
            <p className="mt-1 max-w-xs text-[15px] text-muted">
              Note what you pay for — vegetables, gas — and Today shows what is left.
            </p>
          </div>
        ) : (
          section(today!)
        )}
        {earlier.map(section)}
      </div>

      <ExpenseSheet open={adding} screen={screen} onClose={() => setAdding(false)} />
      <RemoveSheet expense={viewed} screen={screen} onClose={() => setViewing(null)} />
    </section>
  );
}
