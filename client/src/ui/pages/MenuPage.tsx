import { useState } from "react";
import { MdAdd, MdMenuBook, MdSell } from "react-icons/md";
import type { CategoryId, ItemId } from "../../domain/menu";
import { useMenuBuilder } from "../../usecases/useMenuBuilder";
import { Button } from "../design-system/Button";
import { PageHeader } from "../design-system/PageHeader";
import { CategorySheet } from "../features/menu/CategorySheet";
import { ItemSheet } from "../features/menu/ItemSheet";
import { MenuList } from "../features/menu/MenuList";
import { PriceListsSheet } from "../features/menu/PriceListsSheet";
import { QuickAddSheet } from "../features/menu/QuickAddSheet";

// Which sheet is open is visual-only state; everything else comes from the use case.
type OpenSheet =
  | { kind: "quickAdd" }
  | { kind: "item"; id: ItemId }
  | { kind: "addCategory" }
  | { kind: "editCategory"; id: CategoryId }
  | { kind: "priceLists" }
  | null;

export default function MenuPage() {
  const menu = useMenuBuilder();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const close = () => setSheet(null);

  if (menu.state === "loading") return <PageHeader title="Menu" />;

  if (menu.state === "empty") {
    return (
      <section className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center text-center">
        <MdMenuBook className="mb-4 text-6xl text-primary" aria-hidden />
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Your menu starts here</h1>
        <p className="mt-2 mb-6 text-[17px] text-muted">
          Add your dishes once. Every order, bill and day&rsquo;s total uses them.
        </p>
        <Button
          className="w-full"
          onClick={async () => {
            await menu.createMenu();
            setSheet({ kind: "quickAdd" });
          }}
        >
          Create Menu
        </Button>
      </section>
    );
  }

  const sectionOf = (id: CategoryId) =>
    menu.sections.find((s) => s.kind === "category" && s.category.id === id);
  const editedItem =
    sheet?.kind === "item" ? (menu.sections.flatMap((s) => s.items).find((i) => i.id === sheet.id) ?? null) : null;
  const editedSection = sheet?.kind === "editCategory" ? sectionOf(sheet.id) : undefined;

  return (
    <section className="mx-auto max-w-3xl">
      <PageHeader
        title="Menu"
        actions={
          <>
            <Button variant="plain" onClick={() => setSheet({ kind: "priceLists" })}>
              <MdSell className="hidden text-xl md:block" />
              Prices
            </Button>
            <Button onClick={() => setSheet({ kind: "quickAdd" })}>
              <MdAdd className="-ml-1 text-xl" /> Add Item
            </Button>
          </>
        }
      />

      <MenuList
        menu={menu}
        onEditItem={(id) => setSheet({ kind: "item", id })}
        onEditCategory={(id) => setSheet({ kind: "editCategory", id })}
        onAddCategory={() => setSheet({ kind: "addCategory" })}
      />

      <QuickAddSheet open={sheet?.kind === "quickAdd"} onClose={close} menu={menu} />
      <ItemSheet item={editedItem} menu={menu} onClose={close} />
      <CategorySheet
        target={
          sheet?.kind === "addCategory"
            ? { kind: "add" }
            : editedSection?.kind === "category"
              ? { kind: "edit", category: editedSection.category, itemCount: editedSection.items.length }
              : null
        }
        menu={menu}
        onClose={close}
      />
      <PriceListsSheet open={sheet?.kind === "priceLists"} menu={menu} onClose={close} />
    </section>
  );
}
