// 11a: half / full. The owner adds a dish sold half and full, turns an old
// dish half too, and a waiter orders both portions in one tap each.
// usage: node portions.mjs <name> <width> <height> <light|dark>

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

// Two price lists and two categories (under four, so they start open).
await page.evaluate(async () => {
  const open = indexedDB.open("tap2chef");
  const idb = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = rej)));
  const meta = { accountId: "test", shopId: "test", createdAt: 1, updatedAt: 1, deleted: false };
  const tx = idb.transaction(["menuProfiles", "categories", "items"], "readwrite");
  tx.objectStore("menuProfiles").put({ ...meta, id: "dine", name: "Dine-In", sortKey: "1" });
  tx.objectStore("menuProfiles").put({ ...meta, id: "take", name: "Takeaway", sortKey: "2" });
  ["Biryani", "Mains"].forEach((c, i) => tx.objectStore("categories").put({ ...meta, id: c, name: c, sortKey: `${i + 1}` }));
  const both = (dine, take) => ({ dine: { kind: "fixed", price: dine * 100 }, take: { kind: "fixed", price: take * 100 } });
  tx.objectStore("items").put({ ...meta, id: "dal", name: "Dal Tadka", categoryId: "Mains", diet: "veg", sortKey: "1", prices: both(160, 150) });
  tx.objectStore("items").put({ ...meta, id: "naan", name: "Butter Naan", categoryId: "Mains", diet: "veg", sortKey: "2", prices: both(50, 45) });
  await new Promise((res) => (tx.oncomplete = res));
  idb.close();
});

// ---- Quick Add: a dish sold half and full
await page.goto(`${BASE}/menu`);
await page.getByRole("heading", { name: "Menu", level: 1 }).waitFor();
await page.getByRole("button", { name: "Add Item" }).first().click();
const add = page.getByRole("dialog");
await add.getByLabel("Category").selectOption({ label: "Biryani" });
await add.getByLabel("Name").fill("Chicken Biryani Hyderabadi Dum");
await add.getByLabel("Price").fill("320");
await add.getByRole("switch", { name: "Sold half too" }).click();
check((await add.getByRole("textbox", { name: "Full", exact: true }).count()) === 1, "the price is called Full once half is on");
await add.getByRole("textbox", { name: "Half", exact: true }).fill("400");
await add.getByRole("radio", { name: /^Non-veg/ }).click();
await add.getByRole("button", { name: "Add Item" }).click();
await page.waitForTimeout(300);
check(await add.getByText("Half should cost less than full").isVisible(), "a half above the full price is refused");
await shot("quickadd-half-error");
await add.getByRole("textbox", { name: "Half", exact: true }).fill("180");
await add.getByRole("button", { name: "Add Item" }).click();
await page.waitForTimeout(300);
check(await add.getByText("Chicken Biryani Hyderabadi Dum added").isVisible(), "the half / full dish is added");
check((await add.getByRole("textbox", { name: "Half", exact: true }).inputValue()) === "", "half stays on for the next dish, empty");
await shot("quickadd-added");
await add.getByRole("button", { name: "Done" }).click();
await page.waitForTimeout(300);
await shot("menu-list");

// ---- Edit Item: an old dish becomes half and full
await page.getByRole("button", { name: /Dal Tadka/ }).click();
const edit = page.getByRole("dialog", { name: "Edit Item" });
await edit.getByRole("switch", { name: "Sold half too" }).click();
await edit.getByLabel("Dine-In half price").fill("100");
await edit.getByLabel("Takeaway half price").fill("90");
await shot("edit-half");
await edit.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Dal Tadka/ }).click();
check((await edit.getByLabel("Dine-In half price").inputValue()) === "100", "the half price reopens as saved");
await edit.getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(300);

// ---- The order: one tap per portion
await page.goto(`${BASE}/tables`);
await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await page.locator("a[href^='/tables/']").nth(0).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
await shot("order-portions");

const portion = (dish, p) => page.getByRole("button", { name: new RegExp(`^${dish}[^,]*, ${p} ₹`) });
await portion("Chicken Biryani", "Half").click();
await portion("Chicken Biryani", "Half").click();
await portion("Chicken Biryani", "Full").click();
await portion("Dal Tadka", "Full").click();
await page.getByRole("button", { name: /^Butter Naan,/ }).click();
check(await portion("Chicken Biryani", "Half").getAttribute("aria-label").then((l) => l.includes("2 in order")), "Half counts 2");
check(await portion("Chicken Biryani", "Full").getAttribute("aria-label").then((l) => l.includes("1 in order")), "Full counts 1");

// Return in search never guesses a portion.
const search = page.getByPlaceholder("Search dishes");
await search.fill("cb");
await search.press("Enter");
await page.waitForTimeout(200);
check(await portion("Chicken Biryani", "Half").getAttribute("aria-label").then((l) => l.includes("2 in order")), "Return on a half / full dish adds nothing");
await search.fill("");
await shot("order-counted");

const isPhone = Number(width) < 1024;
if (isPhone) await page.getByRole("button", { name: /View order/ }).click();
await page.waitForTimeout(300);
await shot("cart");
check((await page.getByText("· Half", { exact: true }).count()) > 0, "the cart says Half");

const sendBtn = isPhone ? page.getByRole("button", { name: "Send", exact: true }).last() : page.getByRole("button", { name: "Send to Kitchen" });
await sendBtn.click();
await page.waitForURL(/\/tables$/);
await page.locator("a[href^='/tables/']").nth(0).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
await shot("order-sent");
// 2 × 180 + 320 + Dal 160 + Naan 50 = 890
check((await page.getByText("₹890").count()) > 0, "the total is ₹890");

// On a phone the sent rounds sit in the order sheet, Print beside each.
if (isPhone) {
  await page.getByRole("button", { name: /View order/ }).click();
  await page.getByRole("button", { name: "Print round 1 for the kitchen" }).waitFor();
  await shot("sent-sheet-print");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

// The kitchen slip: Print on the sent round, read as a 58 mm roll would show it.
if (!isPhone) {
  await page.getByRole("button", { name: "Print round 1 for the kitchen" }).click();
  await page.waitForTimeout(300);
  const slip = await page.evaluate(() => [...document.querySelectorAll("iframe")].at(-1)?.contentDocument?.documentElement.outerHTML ?? "");
  check(slip.includes("HALF") && slip.includes("Table 1") && !slip.includes("₹"), "the KOT says where and HALF, and has no prices");
  const roll = await context.newPage();
  await roll.setViewportSize({ width: 220, height: 400 });
  await roll.setContent(slip);
  await roll.screenshot({ path: `${OUT}${name}-kot.png` });
  await roll.close();
}

// Out today takes both portions.
await page.getByRole("button", { name: /Out today|out$/ }).first().click();
await page.getByRole("switch", { name: /^Chicken Biryani.* available/ }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check((await portion("Chicken Biryani", "Half").count()) === 0, "out today hides both portions");
await shot("order-out-today");

// The day's numbers count a half and a full apart.
await page.goto(`${BASE}/today`);
await page.getByText("Sold most").waitFor();
await shot("today");
check((await page.getByText(/· Half/).count()) > 0 && (await page.getByText(/· Full/).count()) > 0, "Sold most names each portion");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
