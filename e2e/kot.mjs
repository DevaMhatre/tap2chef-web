// 9b: printing by itself. Bluetooth can't be driven here, so what is around
// it is: the Kitchen printer section, a round's KOT number once the kitchen
// has it, the night's tally on Today, and the banner when the printer is lost.
// usage: node kot.mjs <name> <width> <height> <light|dark>

import { chromium } from "playwright";
import { skipSetup } from "./skipSetup.mjs";

const [name, width, height, scheme] = process.argv.slice(2);
const OUT = new URL("./shots/", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, colorScheme: scheme, hasTouch: Number(width) < 768, isMobile: Number(width) < 768, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
const check = (ok, what) => (ok ? console.log(`ok  ${what}`) : errors.push(`FAILED ${what}`));
let n = 0;
const shot = async (label) => {
  await page.waitForTimeout(500);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  if (sw > iw) errors.push(`horizontal overflow at ${label}: ${sw} > ${iw}`);
  await page.screenshot({ path: `${OUT}${name}-${String(++n).padStart(2, "0")}-${label}.png` });
};
const idb = (fn, arg) => page.evaluate(async ([body, a]) => {
  const open = indexedDB.open("tap2chef");
  const db = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = rej)));
  const out = await new Function("db", "a", `return (async () => { ${body} })()`)(db, a);
  db.close();
  return out;
}, [fn, arg]);

await skipSetup(page, `${BASE}/tables`);
await page.waitForSelector("text=How many tables?");
await idb(`
  const meta = { accountId: "test", shopId: "test", createdAt: 1, updatedAt: 1, deleted: false };
  const tx = db.transaction(["menuProfiles", "categories", "items"], "readwrite");
  tx.objectStore("menuProfiles").put({ ...meta, id: "dine", name: "Dine-In", sortKey: "1" });
  tx.objectStore("categories").put({ ...meta, id: "Mains", name: "Mains", sortKey: "1" });
  tx.objectStore("items").put({ ...meta, id: "dal", name: "Veg Dum Biryani", categoryId: "Mains", diet: "veg", sortKey: "1", prices: { dine: { kind: "fixed", price: 22000 } } });
  await new Promise((r) => (tx.oncomplete = r));
`);
await page.goto(`${BASE}/tables`);
await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await page.locator("a[href^='/tables/']").nth(2).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
await page.getByRole("button", { name: /^Veg Dum Biryani,/ }).click();
const isPhone = Number(width) < 1024;
await (isPhone ? page.getByRole("button", { name: "Send", exact: true }).last() : page.getByRole("button", { name: "Send to Kitchen" })).click();
await page.waitForURL(/\/tables$/);

// The kitchen printer printed it, as KOT 3 (as the printing phone writes it).
const kot = await idb(`
  const lines = await new Promise((r) => { const q = db.transaction("orderItems").objectStore("orderItems").getAll(); q.onsuccess = () => r(q.result); });
  const line = lines[0];
  const day = await new Promise((r) => { const q = db.transaction("orders").objectStore("orders").get(line.orderId); q.onsuccess = () => r(q.result.businessDate); });
  const tx = db.transaction(["kotPrints"], "readwrite");
  tx.objectStore("kotPrints").put({ id: "round:" + line.state.roundId, accountId: "test", shopId: "test", createdAt: 1, updatedAt: 1, deleted: false, orderId: line.orderId, businessDate: day, number: 3, kind: "round", printedAt: Date.now() });
  await new Promise((r) => (tx.oncomplete = r));
  return "ok";
`);
check(kot === "ok", "a KOT record for the round");
await page.goto(`${BASE}/tables`);
await page.locator("a[href^='/tables/']").nth(2).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
if (isPhone) await page.getByRole("button", { name: /View order/ }).click();
await page.getByText(/KOT 3 ·/).last().waitFor();
check(true, "the round shows its KOT number");
await shot("round-kot-number");
if (isPhone) await page.keyboard.press("Escape");

// Another round, at table 4, that hasn't printed after a minute (the internet was down).
await page.goto(`${BASE}/tables`);
await page.locator("a[href^='/tables/']").nth(3).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
await page.getByRole("button", { name: /^Veg Dum Biryani,/ }).click();
await (isPhone ? page.getByRole("button", { name: "Send", exact: true }).last() : page.getByRole("button", { name: "Send to Kitchen" })).click();
await page.waitForURL(/\/tables$/);
// The internet goes: this round never reached the kitchen printer, and the phone says so.
await context.setOffline(true);
await page.locator("a[href^='/tables/']").nth(3).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
if (isPhone) await page.getByRole("button", { name: /View order/ }).click();
await page.getByText("Not sent to the kitchen").last().waitFor();
check(await page.getByText(/has no internet, so the kitchen printer hasn.t got this round/).last().isVisible(), "offline, a round that didn't print says to tell the kitchen");
check(!(await page.getByRole("button", { name: /Print round 1 for the kitchen/ }).isVisible()), "and offers no Print that would come out twice");
await shot("round-not-sent");
if (isPhone) await page.keyboard.press("Escape");
await context.setOffline(false);

// The tally: KOT 3, its bill not paid yet.
await page.goto(`${BASE}/today`);
await page.getByRole("heading", { name: "KOTs" }).waitFor();
check(await page.getByText("1 not paid").isVisible(), "the tally names the unpaid KOT");
check(await page.getByText("KOT 3 · Table 3").isVisible(), "and where it went");
await page.getByRole("heading", { name: "KOTs" }).scrollIntoViewIfNeeded();
await shot("today-tally");

// The Kitchen printer section in the restaurant sheet.
await page.goto(`${BASE}/tables`);
await page.getByRole("button", { name: /Tap2Chef|Restaurant/ }).first().click().catch(() => {});
await page.getByRole("heading", { name: "Kitchen printer" }).waitFor();
await page.getByRole("heading", { name: "Kitchen printer" }).scrollIntoViewIfNeeded();
const offered = await page.getByRole("button", { name: "Print KOTs from this phone" }).isVisible();
const unsupported = await page.getByText("can’t reach a Bluetooth printer").isVisible();
check(offered || unsupported, `the sheet offers the kitchen printer (${offered ? "Bluetooth here" : "no Bluetooth in this browser"})`);
await shot("printer-section");

// A printer picked before and not reachable now: the banner, with what waits.
if (offered) {
  await idb(`
    const tx = db.transaction(["meta"], "readwrite");
    tx.objectStore("meta").put({ key: "kitchenPrinter", value: JSON.stringify({ id: "x", name: "EZO printer" }) });
    tx.objectStore("meta").put({ key: "kitchenPrinterKnown", value: "[]" });
    await new Promise((r) => (tx.oncomplete = r));
  `);
  await page.goto(`${BASE}/tables`);
  await page.getByText("Printer not connected").waitFor();
  check(await page.getByRole("button", { name: "Reconnect" }).isVisible(), "the printing phone says the printer is lost, with Reconnect");
  await shot("printer-lost");
}

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
