import { useState } from "react";
import { MdAdd, MdRemoveCircle } from "react-icons/md";
import { TABLE_NAME_MAX, type DiningTable } from "../../../domain/tables";
import type { ReadyTables } from "../../../usecases/useTables";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { nameMessage } from "../menu/display";
import { tableTitle } from "../order/labels";

type Props = { open: boolean; tables: ReadyTables; onClose: () => void };

export function EditTablesSheet({ open, tables, onClose }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tables"
      dismissLabel={null}
      action={
        <Button size="compact" variant="tinted" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        <ListSection header={`Tables · ${tables.floor.length}`} footer="A table with guests can't be removed.">
          {tables.floor.map(({ table, active }) => (
            <TableRow key={table.id} table={table} occupied={Boolean(active)} tables={tables} />
          ))}
        </ListSection>
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await tables.addTable();
            haptic();
          }}
        >
          <MdAdd className="text-xl" /> Add Table
        </Button>
      </div>
    </Sheet>
  );
}

function TableRow({ table, occupied, tables }: { table: DiningTable; occupied: boolean; tables: ReadyTables }) {
  const showUndo = useUndoToast();
  const [name, setName] = useState(table.name);
  const [error, setError] = useState<string>();

  async function rename() {
    if (name === table.name) return;
    const result = await tables.renameTable(table.id, name);
    if (result.ok) setName(result.value.name);
    else setError(nameMessage(result.error, TABLE_NAME_MAX));
  }

  async function remove() {
    const result = await tables.removeTable(table.id);
    if (result.ok) showUndo(`Removed ${tableTitle(table.name)}`, result.value);
  }

  return (
    <div className="flex items-start gap-1 py-1.5 pr-2 pl-1">
      <button
        type="button"
        aria-label={`Remove ${tableTitle(table.name)}`}
        disabled={occupied}
        onClick={remove}
        className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-primary disabled:text-line"
      >
        <MdRemoveCircle />
      </button>
      <TextField
        label="Table name"
        labelHidden
        inset
        className="flex-1"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={TABLE_NAME_MAX + 4}
        value={name}
        error={error}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        onBlur={rename}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}
