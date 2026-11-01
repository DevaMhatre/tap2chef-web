import { err, ok } from "../../domain/result";
import type { PrinterLink, PrinterState } from "../../usecases/ports";
import { db } from "../db/db";
import { kotBytes } from "./kitchenPrinter";
import { PRINTER_SERVICES, writeChunks } from "./printerCheck";

// The kitchen printer over Bluetooth LE, as the printer check proved it on
// the first restaurant's EZO: pick it once, then write ESC/POS to the first
// writable characteristic of a printer service. Picking needs a tap (the
// browser asks); afterwards the phone goes back to it by itself where Chrome
// allows (`getDevices`), and asks for one tap where it doesn't.

const SAVED = "kitchenPrinter";
const KNOWN = "kitchenPrinterKnown";

type Saved = { id: string; name: string };
type Writable = Parameters<typeof writeChunks>[0];

let state: PrinterState = { kind: "none" };
let device: BluetoothDevice | undefined;
let target: Writable | undefined;
const listeners = new Set<(state: PrinterState) => void>();
const set = (next: PrinterState) => {
  state = next;
  listeners.forEach((l) => l(next));
};

const readSaved = async (): Promise<Saved | undefined> => {
  try {
    return JSON.parse((await db.meta.get(SAVED))?.value ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
};

/** The first characteristic a printer service lets us write to. */
async function writableOf(found: BluetoothDevice): Promise<Writable> {
  const server = await found.gatt!.connect();
  for (const service of await server.getPrimaryServices().catch(() => [])) {
    for (const characteristic of await service.getCharacteristics().catch(() => [])) {
      if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) return characteristic;
    }
  }
  server.disconnect();
  throw new Error("No printer service to write to");
}

// One listener, on the printer in use: switched off, out of paper and back,
// out of range, it tries once by itself. Stop removes it first, so stopping
// never looks like a lost printer.
let onDisconnect: (() => void) | undefined;
function watch(found: BluetoothDevice, name: string) {
  if (onDisconnect) device?.removeEventListener("gattserverdisconnected", onDisconnect);
  onDisconnect = () => {
    target = undefined;
    set({ kind: "lost", name });
    void bluetoothLink.reconnect();
  };
  found.addEventListener("gattserverdisconnected", onDisconnect);
}

async function attach(found: BluetoothDevice, name: string) {
  set({ kind: "connecting", name });
  target = await writableOf(found);
  if (device !== found) watch(found, name);
  device = found;
  set({ kind: "ready", name });
}

// One slip at a time: two KOTs written together would interleave on paper.
let queue: Promise<unknown> = Promise.resolve();

export const bluetoothLink: PrinterLink = {
  subscribe(onChange) {
    listeners.add(onChange);
    onChange(state);
    if (state.kind === "none") {
      if (!navigator.bluetooth) set({ kind: "unsupported" });
      else void readSaved().then((saved) => saved && state.kind === "none" && (set({ kind: "lost", name: saved.name }), void bluetoothLink.reconnect()));
    }
    return () => listeners.delete(onChange);
  },

  async connect(known) {
    if (!navigator.bluetooth) return err("unsupported");
    let found: BluetoothDevice;
    try {
      found = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
    } catch (error) {
      return error instanceof DOMException && error.name === "NotFoundError" ? err("cancelled") : err("failed");
    }
    const name = found.name || "Printer";
    // Saved first: once it reads "ready", what this phone started from must already be there.
    await db.meta.bulkPut([
      { key: SAVED, value: JSON.stringify({ id: found.id, name } satisfies Saved) },
      { key: KNOWN, value: JSON.stringify(known) },
    ]);
    try {
      await attach(found, name);
    } catch {
      set({ kind: "lost", name });
      return err("failed");
    }
    return ok(undefined);
  },

  async reconnect() {
    const saved = await readSaved();
    if (!saved) return err("failed");
    if (state.kind === "ready") return ok(undefined);
    try {
      // The same page still holds the device; after a reload, only Chrome's
      // remembered permissions can hand it back without a tap.
      const getDevices = (navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> } | undefined)?.getDevices;
      const found = device ?? (await getDevices?.call(navigator.bluetooth))?.find((d) => d.id === saved.id);
      if (!found) {
        set({ kind: "lost", name: saved.name });
        return err("needsTap");
      }
      await attach(found, saved.name);
      return ok(undefined);
    } catch {
      set({ kind: "lost", name: saved.name });
      return err("failed");
    }
  },

  async forget() {
    if (onDisconnect) device?.removeEventListener("gattserverdisconnected", onDisconnect);
    onDisconnect = undefined;
    device?.gatt?.disconnect();
    device = undefined;
    target = undefined;
    await db.meta.bulkDelete([SAVED, KNOWN]);
    set(navigator.bluetooth ? { kind: "none" } : { kind: "unsupported" });
  },

  async known() {
    try {
      return new Set(JSON.parse((await db.meta.get(KNOWN))?.value ?? "[]"));
    } catch {
      return new Set();
    }
  },

  print(kot) {
    const job = queue.then(async () => {
      if (!target) return err("notReady" as const);
      try {
        await writeChunks(target, kotBytes(kot));
        return ok(undefined);
      } catch {
        return err("failed" as const);
      }
    });
    queue = job.catch(() => undefined);
    return job;
  },
};
