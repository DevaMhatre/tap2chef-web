import type { TableId } from "../../../domain/tables";
import type { ReadyOrder } from "../../../usecases/useOrder";
import { ListNote, ListRow, ListSection } from "../../design-system/GroupedList";
import { Sheet } from "../../design-system/Sheet";
import { tableTitle } from "./labels";

type Props = { open: boolean; screen: ReadyOrder; onClose: () => void; onMoved: (tableId: TableId) => void };

// The party moved: one tap on the table they moved to.
export function MoveSheet({ open, screen, onClose, onMoved }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Move to Table">
      <ListSection header="Free tables">
        {screen.freeTables.length === 0 ? (
          <ListNote>Every table has guests.</ListNote>
        ) : (
          screen.freeTables.map((table) => (
            <ListRow
              key={table.id}
              onClick={async () => {
                const result = await screen.moveTo(table.id);
                if (result.ok) onMoved(table.id);
              }}
            >
              {tableTitle(table.name)}
            </ListRow>
          ))
        )}
      </ListSection>
    </Sheet>
  );
}
