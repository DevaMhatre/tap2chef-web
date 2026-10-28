import { useState } from "react";
import { MdRemoveCircle } from "react-icons/md";
import { NAME_MAX, type MenuProfile } from "../../../domain/menu";
import type { ReadyMenuBuilder } from "../../../usecases/useMenuBuilder";
import { Button } from "../../design-system/Button";
import { TextField } from "../../design-system/Field";
import { ListSection } from "../../design-system/GroupedList";
import { haptic } from "../../design-system/haptic";
import { Sheet } from "../../design-system/Sheet";
import { useUndoToast } from "../../design-system/UndoToast";
import { nameMessage } from "./display";

type Props = { open: boolean; menu: ReadyMenuBuilder; onClose: () => void };

// Price lists ("Dine-In", "Takeaway") are rarely touched, so they live one tap
// away from the menu instead of on it.
export function PriceListsSheet({ open, menu, onClose }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Price Lists"
      dismissLabel={null}
      action={
        <Button size="compact" variant="tinted" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        <ListSection
          header="Lists"
          footer="Each order is priced from one list, e.g. dine-in or takeaway."
        >
          {menu.profiles.map((profile) => (
            <ProfileRow key={profile.id} profile={profile} menu={menu} />
          ))}
        </ListSection>
        <AddProfile menu={menu} />
      </div>
    </Sheet>
  );
}

function ProfileRow({ profile, menu }: { profile: MenuProfile; menu: ReadyMenuBuilder }) {
  const showUndo = useUndoToast();
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState<string>();
  const onlyOne = menu.profiles.length === 1;

  async function rename() {
    if (name === profile.name) return;
    const result = await menu.renameProfile(profile.id, name);
    if (result.ok) setName(result.value.name);
    else setError(nameMessage(result.error, NAME_MAX.profile));
  }

  async function remove() {
    const result = await menu.removeProfile(profile.id);
    if (result.ok) showUndo(`Removed ${profile.name}`, result.value);
  }

  return (
    <div className="flex items-start gap-1 py-1.5 pr-2 pl-1">
      <button
        type="button"
        aria-label={`Remove ${profile.name}`}
        title={onlyOne ? "Every menu needs at least one price list" : undefined}
        disabled={onlyOne}
        onClick={remove}
        className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-primary disabled:text-line"
      >
        <MdRemoveCircle />
      </button>
      <TextField
        label="Price list name"
        labelHidden
        inset
        className="flex-1"
        autoComplete="off"
        enterKeyHint="done"
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

function AddProfile({ menu }: { menu: ReadyMenuBuilder }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const first = menu.profiles[0];

  async function add() {
    const result = await menu.addProfile(name);
    if (!result.ok) return setError(nameMessage(result.error, NAME_MAX.profile));
    haptic();
    setName("");
  }

  return (
    <div className="space-y-3">
      <TextField
        label="New price list"
        placeholder="e.g. Takeaway"
        autoCapitalize="words"
        autoComplete="off"
        enterKeyHint="done"
        value={name}
        error={error}
        hint={first ? `Starts with your ${first.name} prices. Change only what differs.` : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void add();
          }
        }}
      />
      <Button variant="secondary" className="w-full" onClick={add}>
        Add Price List
      </Button>
    </div>
  );
}
