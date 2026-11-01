// 11b: pay later. A regular's bill goes on their name, a second bill is part
// cash, part on their name; they pay it back another time, and the day's
// numbers keep sales and the drawer apart.
// usage: node paylater.mjs <name> <width> <height> <light|dark>

import { chromium } from "playwright";
import { skipSetup } from "./skipSetup.mjs";

const [name, width, height, scheme] = process.argv.slice(2);
const OUT = new URL("./shots/", import.meta.url).pathname;
const BASE = "http://localhost:5199";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: Number(width), height: Number(height) },
  colorScheme: scheme,
  hasTouch: Number(width) < 768,
  isMobile: Number(width) < 768,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const check = (ok, what) => (ok ? console.log(`ok  ${what}`) : errors.push(`FAILED ${what}`));
let n = 0;
const shot = async (label) => {
  await page.waitForTimeout(500);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  if (sw > iw) errors.push(`horizontal overflow at ${label}: ${sw} > ${iw}`);
  await page.screenshot({ path: `${OUT}${name}-${String(++n).padStart(2, "0")}-${label}.png` });
};

await skipSetup(page, `${BASE}/tables`);
await page.waitForSelector("text=How many tables?");
await page.evaluate(async () => {
  const open = indexedDB.open("tap2chef");
  const idb = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = rej)));
  const meta = { accountId: "test", shopId: "test", createdAt: 1, updatedAt: 1, deleted: false };
  const tx = idb.transaction(["menuProfiles", "categories", "items"], "readwrite");
  tx.objectStore("menuProfiles").put({ ...meta, id: "dine", name: "Dine-In", sortKey: "1" });
  tx.objectStore("categories").put({ ...meta, id: "Mains", name: "Mains", sortKey: "1" });
  const dish = (id, name, price, sortKey) =>
    tx.objectStore("items").put({ ...meta, id, name, categoryId: "Mains", diet: "veg", sortKey, prices: { dine: { kind: "fixed", price: price * 100 } } });
  dish("dal", "Dal Makhani", 220, "1");
  dish("naan", "Butter Naan", 50, "2");
  await new Promise((res) => (tx.oncomplete = res));
  idb.close();
});
await page.goto(`${BASE}/tables`);
await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await page.waitForSelector("a[href^='/tables/']");

const isPhone = Number(width) < 1024;
const dish = (d) => page.getByRole("button", { name: new RegExp(`^${d},`) });
const send = () =>
  isPhone ? page.getByRole("button", { name: "Send", exact: true }).last().click() : page.getByRole("button", { name: "Send to Kitchen" }).click();
const bill = () => (isPhone ? page.getByRole("button", { name: "Bill", exact: true }) : page.getByRole("button", { name: /^Bill ₹/ })).click();
const openTable = async (i) => {
  await page.goto(`${BASE}/tables`);
  await page.locator("a[href^='/tables/']").nth(i).click();
  await page.waitForSelector("text=Search dishes", { state: "attached" });
};

// ---- Table 1: the whole bill on Sharma ji's name
await openTable(0);
await dish("Dal Makhani").click();
await send();
await page.waitForURL(/\/tables$/);
await openTable(0);
await bill();
let sheet = page.getByRole("dialog", { name: "Table 1" });
await sheet.getByRole("radio", { name: "Later" }).click();
check(await sheet.getByRole("button", { name: /^Pay Later ₹220/ }).isDisabled(), "Pay Later waits for a name");
await sheet.getByLabel("Whose name?").fill("Sharma ji");
check(await sheet.getByRole("button", { name: /^Pay Later ₹220/ }).isDisabled(), "Pay Later waits for their mobile number");
await sheet.getByLabel("Mobile number").fill("98765 4321");
check(await sheet.getByRole("button", { name: /^Pay Later ₹220/ }).isDisabled(), "nine digits are not a number yet");
await sheet.getByLabel("Mobile number").fill("98765 43210");
check(await sheet.getByText("Sharma ji will owe ₹220.").isVisible(), "says what they will owe");
await shot("bill-later");
await sheet.getByRole("button", { name: /^Pay Later ₹220/ }).dblclick();
await page.waitForTimeout(800);
await shot("settled-later");

// ---- Table 2: ₹100 cash now, the rest on the same name, chosen with one tap
await openTable(1);
await dish("Dal Makhani").click();
await dish("Butter Naan").click();
await dish("Butter Naan").click();
await send();
await page.waitForURL(/\/tables$/);
await openTable(1);
await bill();
sheet = page.getByRole("dialog", { name: "Table 2" });
await sheet.getByRole("radio", { name: "Cash" }).click();
await sheet.getByLabel("Cash received").fill("100");
await sheet.getByRole("button", { name: /^Received ₹100/ }).click();
await page.waitForTimeout(400);
await sheet.getByRole("radio", { name: "Later" }).click();
await sheet.getByRole("button", { name: "Sharma ji, 98765 43210" }).click();
check((await sheet.getByLabel("Mobile number").inputValue()) === "98765 43210", "the regular's chip brings their number");
check(await sheet.getByText("Sharma ji will owe ₹440, ₹220 from before.").isVisible(), "a known regular is one tap, with what they owe");
await shot("bill-later-known");
await sheet.getByRole("button", { name: /^Pay Later ₹220/ }).click();
await page.waitForTimeout(800);

// ---- Orders: settled today shows what went on names; pay later lists who owes
await page.goto(`${BASE}/orders`);
await page.getByText("Pay later").waitFor();
check(await page.getByText(/Later ₹440/).isVisible(), "settled today says ₹440 went on names");
await shot("orders");
await page.getByRole("button", { name: /Pay later/ }).click();
await page.getByRole("heading", { name: "Pay Later" }).waitFor();
check(await page.getByText("2 bills · since today").isVisible(), "Sharma ji: 2 bills since today");
await shot("dues");

// ---- Sharma ji pays back: ₹500 cash against ₹440, change ₹60
await page.getByRole("button", { name: /Sharma ji/ }).click();
const repay = page.getByRole("dialog", { name: "Sharma ji" });
const remind = await repay.getByRole("link", { name: "Remind on WhatsApp" }).getAttribute("href");
const text = decodeURIComponent(remind.split("text=")[1] ?? "");
check(remind.startsWith("https://wa.me/919876543210?text=") && text.includes("₹440") && text.includes("2 bills"), `the reminder is ready to send: ${text}`);
await repay.getByRole("radio", { name: "Cash" }).click();
check((await repay.getByLabel("Cash received").inputValue()) === "440", "the amount starts at what they owe");
await repay.getByLabel("Cash received").fill("500");
check(await repay.getByText("Change ₹60").isVisible(), "cash above what is owed shows the change");
await shot("repay");
await repay.getByRole("button", { name: /^Received ₹440/ }).dblclick();
await page.waitForTimeout(600);
check(await page.getByText("Nobody owes anything.").isVisible(), "paid back: nobody owes anything");
await shot("dues-empty");

// ---- Today: sales count the food; the drawer counts the cash that came in
await page.goto(`${BASE}/today`);
await page.getByText("Paid back by regulars").waitFor();
check(await page.getByText(/Later ₹440/).isVisible(), "sales show ₹440 later");
const repaidOnce = await page.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const o = indexedDB.open("tap2chef"); o.onsuccess = () => res(o.result); o.onerror = rej; });
  const rows = await new Promise((res) => { const r = idb.transaction("repayments").objectStore("repayments").getAll(); r.onsuccess = () => res(r.result); });
  idb.close();
  return rows.length;
});
check(repaidOnce === 1, `a double tap recorded the repayment once (${repaidOnce})`);
await shot("today");
// Drawer: ₹100 cash for table 2 + ₹440 paid back = ₹540
check((await page.getByText("₹540").count()) > 0, "the drawer counts ₹540 cash");
await page.mouse.wheel(0, 600);
await shot("today-drawer");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
