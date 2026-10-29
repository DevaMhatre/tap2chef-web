// Drives the bill flow end to end and screenshots each step.
// usage: node shots.mjs <name> <width> <height> <light|dark>


import { chromium } from "playwright";

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
let n = 0;
const shot = async (label) => {
  await page.waitForTimeout(450);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  if (sw > iw) errors.push(`horizontal overflow at ${label}: ${sw} > ${iw}`);
  await page.screenshot({ path: `${OUT}${name}-${String(++n).padStart(2, "0")}-${label}.png` });
};

await page.goto(`${BASE}/tables`);
await page.waitForSelector("text=How many tables?");

// Seed a menu straight into IndexedDB, shaped as the app stores it.
await page.evaluate(async () => {
  const open = indexedDB.open("tap2chef");
  const idb = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = rej)));
  const meta = { accountId: "test", shopId: "test", createdAt: 1, updatedAt: 1, deleted: false };
  const tx = idb.transaction(["menuProfiles", "categories", "items"], "readwrite");
  const p = (id, name, sortKey) => tx.objectStore("menuProfiles").put({ ...meta, id, name, sortKey });
  p("dine", "Dine-In", "1");
  p("take", "Takeaway", "2");
  const cats = ["Starters", "Mains", "Breads", "Drinks"];
  cats.forEach((c, i) => tx.objectStore("categories").put({ ...meta, id: c, name: c, sortKey: `${i + 1}` }));
  const dishes = [
    ["Paneer Tikka", "Starters", "veg", 240, 240],
    ["Chicken 65", "Starters", "nonVeg", 280, 270],
    ["Veg Manchurian Dry with Extra Spring Onion and Garlic", "Starters", "veg", 190, 180],
    ["Egg Bhurji", "Starters", "egg", 120, 110],
    ["Dal Makhani", "Mains", "veg", 220, 200],
    ["Butter Chicken", "Mains", "nonVeg", 340, 320],
    ["Kadai Paneer", "Mains", "veg", 260, null],
    ["Jeera Rice", "Mains", "veg", 140, 130],
    ["Butter Naan", "Breads", "veg", 50, 45],
    ["Tandoori Roti", "Breads", "veg", 20, 20],
    ["Garlic Naan", "Breads", "veg", 60, 55],
    ["Sweet Lassi", "Drinks", "veg", 80, 80],
    ["Masala Chaas", "Drinks", "veg", 50, 50],
    ["Water", "Drinks", "veg", 0, 0],
  ];
  dishes.forEach(([dish, cat, diet, dine, take], i) => {
    const prices = { dine: { kind: "fixed", price: dine * 100 } };
    if (take !== null) prices.take = { kind: "fixed", price: take * 100 };
    tx.objectStore("items").put({ ...meta, id: `i${i}`, name: dish, categoryId: cat, diet, sortKey: `${i + 1}`, prices });
  });
  await new Promise((res) => (tx.oncomplete = res));
  idb.close();
});

if (process.env.OFFLINE) await context.setOffline(true);
await shot("setup");
await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await page.waitForSelector("a[href^='/tables/']");
await shot("grid-empty");

await page.locator("a[href^='/tables/']").nth(3).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
await shot("order-new");

const dish = (name) => page.getByRole("button", { name: new RegExp(`^${name},`) });
const isPhone = Number(width) < 1024;
const sendBtn = () => (isPhone ? page.getByRole("button", { name: "Send", exact: true }) : page.getByRole("button", { name: "Send to Kitchen" }));
const nextBtn = (word) => (isPhone ? page.getByRole("button", { name: word, exact: true }) : page.getByRole("button", { name: new RegExp(`^${word} ₹`) }));
const sheet = page.getByRole("dialog", { name: "Table 4" });

await dish("Paneer Tikka").click();
for (let i = 0; i < 3; i++) await dish("Butter Naan").click();
await dish("Dal Makhani").click();
await dish("Masala Chaas").click();
await sendBtn().click();
await page.waitForURL(/\/tables$/);
await page.locator("a[href^='/tables/']").nth(3).click();
await shot("order-sent");

await nextBtn("Bill").click();
await shot("bill");
await sheet.getByRole("button", { name: "Round off or discount" }).click();
await sheet.getByLabel("Guest pays").fill("600");
await sheet.getByLabel("Reason (optional)").fill("Regular");
await sheet.getByRole("radio", { name: "UPI" }).click();
await shot("bill-upi-full");
await sheet.getByLabel("UPI received").fill("300");
await shot("bill-part");
await sheet.getByRole("button", { name: /^Received ₹300/ }).click();
await page.waitForTimeout(300);
await shot("after-part");
await sheet.getByRole("button", { name: "Back" }).click();
await page.goto(`${BASE}/tables`);
await shot("floor-billed");

await page.locator("a[href^='/tables/']").nth(3).click();
await nextBtn("Settle").click();
await sheet.getByRole("radio", { name: "Cash" }).click();
await sheet.getByLabel("Cash received").fill("500");
await shot("cash-change");
await sheet.getByRole("button", { name: /^Settle ₹300/ }).dblclick();
await page.waitForTimeout(350);
await shot("done");
await page.waitForURL(/\/tables$/);
await shot("settled-toast");
await page.getByRole("button", { name: "Undo" }).click();
await page.waitForTimeout(400);
await shot("after-undo");

await page.locator("a[href^='/tables/']").nth(3).click();
await nextBtn("Settle").click();
await sheet.getByRole("radio", { name: "Cash" }).click();
await sheet.getByRole("button", { name: /^Settle ₹300/ }).click();
await page.waitForURL(/\/tables$/, { timeout: 5000 });
await page.waitForTimeout(5500);

await page.goto(`${BASE}/orders`);
await page.getByRole("button", { name: /Takeaway/ }).click();
await page.waitForSelector("text=Token 1");
await dish("Water").click();
await sendBtn().click();
await page.waitForURL(/\/orders$/);
await page.getByRole("button", { name: /Token 1/ }).click();
await nextBtn("Bill").click();
await shot("bill-zero");
await page.getByRole("dialog").getByRole("button", { name: "Close bill" }).click();
await page.waitForURL(/\/orders$/, { timeout: 5000 });
await page.waitForTimeout(5500);
await shot("orders");
await page.getByRole("button", { name: /^Settled today/ }).click();
await shot("settled-page");
await page.getByRole("button", { name: /^Table 4/ }).click();
await shot("settled-sheet");
await page.getByRole("radio", { name: "Cash" }).first().click();
await shot("settled-edit");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(400);
await shot("settled-corrected");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
