// 6f: collapsible categories on the Menu tab.
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
await page.goto(`${BASE}/menu`);
await page.getByRole("heading", { name: "Menu", level: 1 }).waitFor();
await shot("menu-collapsed");
await page.getByRole("button", { name: /^Mains/ }).click();
await shot("menu-mains-open");
await page.getByRole("button", { name: "Add Item" }).first().click();
const add = page.getByRole("dialog");
await add.getByLabel("Category").selectOption({ label: "Drinks" });
await add.getByLabel("Name").fill("Fresh Lime Soda with Mint and a Very Long Name");
await add.getByLabel("Price").fill("70");
await add.getByRole("radio", { name: /^Veg/ }).click();
await add.getByRole("button", { name: "Add Item" }).click();
await page.waitForTimeout(300);
await add.getByRole("button", { name: "Done" }).click();
await page.waitForTimeout(300);
await shot("menu-drinks-opened");
await page.getByRole("button", { name: /^Mains/ }).click();
await shot("menu-mains-closed");

// The order screen stays fully open.
await page.goto(`${BASE}/tables`);
await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await page.locator("a[href^='/tables/']").nth(0).click();
await page.waitForSelector("text=Search dishes", { state: "attached" });
await shot("order-still-open");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
