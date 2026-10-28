import { useState } from "react";
import { useTables } from "../../usecases/useTables";
import { Button } from "../design-system/Button";
import { PageHeader } from "../design-system/PageHeader";
import { EditTablesSheet } from "../features/tables/EditTablesSheet";
import { TableGrid } from "../features/tables/TableGrid";
import { TableSetup } from "../features/tables/TableSetup";
import { formatPrice } from "../format";

export default function TablesPage() {
  const tables = useTables();
  const [editing, setEditing] = useState(false);

  if (tables.state === "loading") return <PageHeader title="Tables" />;
  if (tables.state === "empty") return <TableSetup {...tables} />;

  return (
    <section className="mx-auto max-w-5xl">
      <PageHeader
        title="Tables"
        actions={
          <Button variant="plain" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />
      {/* The cashier's rush-hour radar: money handed a bill and not yet in. */}
      {tables.waiting > 0 && (
        <p className="-mt-2 mb-4 text-[15px] text-muted">
          <span className="font-semibold text-warning tabular-nums">{formatPrice(tables.waiting)}</span> waiting to be paid
        </p>
      )}
      <TableGrid floor={tables.floor} />
      <EditTablesSheet open={editing} tables={tables} onClose={() => setEditing(false)} />
    </section>
  );
}
