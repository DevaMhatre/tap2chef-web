import type { PrinterCheck, PrinterTry } from "../../usecases/ports";
import { testKot } from "./escpos";

// Two routes a web app has to a receipt printer, tried for real.
//
// Bluetooth: Web Bluetooth reaches only Bluetooth Low Energy devices. Many
// cheap printers speak only classic Bluetooth, which no web page can reach;
// those simply never appear in the list. Printers that do speak LE expose a
// "write" characteristic on one of a few well-known services.
//
// USB: WebUSB with an OTG cable, writing to the printer's bulk OUT endpoint.

/** Services receipt printers are known to offer over LE; the page may only open those it names. */
export const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
];

/** Small writes: many printers take 20 bytes at a time over LE and drop the rest. */
export const BLE_CHUNK = 20;

const cancelled = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

type Writable = { writeValueWithResponse(data: BufferSource): Promise<void>; writeValueWithoutResponse(data: BufferSource): Promise<void>; properties: { write: boolean; writeWithoutResponse: boolean } };

/** Sends bytes to a characteristic in chunks, waiting for each. */
export async function writeChunks(characteristic: Writable, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const quick = characteristic.properties.writeWithoutResponse;
  for (let at = 0; at < bytes.length; at += BLE_CHUNK) {
    const chunk = bytes.slice(at, at + BLE_CHUNK);
    await (quick ? characteristic.writeValueWithoutResponse(chunk) : characteristic.writeValueWithResponse(chunk));
  }
}

async function tryBluetooth(): Promise<PrinterTry> {
  if (!navigator.bluetooth) return { outcome: "unsupported" };
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  } catch (error) {
    return cancelled(error) ? { outcome: "cancelled" } : { outcome: "failed", detail: String(error) };
  }
  const name = device.name || "Bluetooth device";
  try {
    const server = await device.gatt!.connect();
    const services = await server.getPrimaryServices().catch(() => []);
    const seen: string[] = [];
    for (const service of services) {
      seen.push(service.uuid);
      for (const characteristic of await service.getCharacteristics().catch(() => [])) {
        if (!characteristic.properties.write && !characteristic.properties.writeWithoutResponse) continue;
        await writeChunks(characteristic, testKot());
        server.disconnect();
        return { outcome: "printed", name, detail: `Bluetooth LE · service ${service.uuid} · characteristic ${characteristic.uuid}` };
      }
    }
    server.disconnect();
    return { outcome: "failed", name, detail: seen.length ? `Connected, but no printer service to write to. Services: ${seen.join(", ")}` : "Connected, but it offers none of the printer services we know." };
  } catch (error) {
    return { outcome: "failed", name, detail: String(error) };
  }
}

async function tryUsb(): Promise<PrinterTry> {
  if (!navigator.usb) return { outcome: "unsupported" };
  let device: USBDevice;
  try {
    device = await navigator.usb.requestDevice({ filters: [] });
  } catch (error) {
    return cancelled(error) ? { outcome: "cancelled" } : { outcome: "failed", detail: String(error) };
  }
  const name = device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`;
  try {
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    for (const iface of device.configuration!.interfaces) {
      const endpoint = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (!endpoint) continue;
      await device.claimInterface(iface.interfaceNumber);
      await device.transferOut(endpoint.endpointNumber, testKot());
      await device.close();
      return { outcome: "printed", name, detail: `USB · interface ${iface.interfaceNumber} · endpoint ${endpoint.endpointNumber}` };
    }
    await device.close();
    return { outcome: "failed", name, detail: "Opened, but it has no place to send print data." };
  } catch (error) {
    return { outcome: "failed", name, detail: String(error) };
  }
}

export const webPrinterCheck: PrinterCheck = {
  tryPrint: (route) => (route === "bluetooth" ? tryBluetooth() : tryUsb()),
};
