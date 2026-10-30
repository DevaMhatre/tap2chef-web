// Step 10c: a new owner's setup. Online at four sizes, light and dark (sign
// in, name, how customers order, tables, dishes, ready); a takeaway kitchen
// set up offline that signs in later through the card; a second phone of the
// same restaurant; a setup interrupted and picked up again.
// Needs the API (cd server && npm run dev:memory > api.log) and the dev server on :5199.
// Usage: node setup.mjs <path to api.log>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const S = new URL(".", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const LOG = process.argv[2];
const RUN = Date.now().toString(36);
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };
const codeFor = (email) => [...readFileSync(LOG, "utf8").matchAll(new RegExp(`Sign-in code for ${email}: (\\d{6})`, "g"))].at(-1)?.[1];

const browser = await chromium.launch({ channel: "chrome" });
async function open(w, h, scheme, name) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2, hasTouch: w < 768, isMobile: w < 768 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
  let n = 0;
  const shot = async (label) => {
    await page.waitForTimeout(500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (wide) errors.push(`horizontal scroll at ${label}`);
    await page.screenshot({ path: `${S}shots/setup-${name}-${String(++n).padStart(2, "0")}-${label}.png` });
  };
  return { ctx, page, errors, shot };
}

async function enterCode(page, email) {
  let code;
  for (let i = 0; i < 30 && !code; i++) { code = codeFor(email); if (!code) await page.waitForTimeout(100); }
  await page.getByLabel("6-digit code").fill(code);
}

async function emailAndCode(page, email) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Enter the code sent to").waitFor();
  await enterCode(page, email);
}

/** Whether any element saying exactly `text` can be seen (the header on a phone, the sidebar on a desktop). */
async function shows(page, text) {
  for (let i = 0; i < 20; i++) {
    const seen = await page.getByText(text, { exact: true }).evaluateAll((els) => els.some((e) => e.checkVisibility({ visibilityProperty: true })));
    if (seen) return true;
    await page.waitForTimeout(100);
  }
  return false;
}
const price = (page, dish) => page.getByLabel(`Price of ${dish}`, { exact: true });

// --- A new owner, online, at every size.
const sizes = [[360, 740, "light", "phone"], [360, 740, "dark", "phone-dark"], [820, 1180, "light", "tablet"], [1440, 900, "dark", "desktop"]];
let firstEmail;
for (const [w, h, scheme, name] of sizes) {
  const { ctx, page, errors, shot } = await open(w, h, scheme, name);
  const email = `setup-${name}-${RUN}@example.com`;
  firstEmail ??= email;

  await page.goto(`${BASE}/`);
  await page.getByText("Keep your restaurant safe").waitFor();
  await shot("account");
  await emailAndCode(page, email);

  await page.getByText("What’s your restaurant called?").waitFor();
  await shot("name");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  check(await page.getByText("Enter the restaurant's name.").isVisible(), `${name}: a name is asked for`);
  await page.getByLabel("Restaurant name").fill("Sharma Dhaba");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByText("How do customers order?").waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  check(await page.getByText("Choose at least one.").isVisible(), `${name}: one way to order is required`);
  await page.getByRole("checkbox", { name: /Dine-in/ }).click();
  await page.getByRole("checkbox", { name: /Takeaway/ }).click();
  await shot("service");
  if (name === "phone") {
    // A customer walks in; the app is closed and opened again.
    await page.reload();
    await page.getByText("How do customers order?").waitFor();
    check(true, "phone: reopened on the same question");
    await page.getByRole("button", { name: "Back" }).click();
    check((await page.getByLabel("Restaurant name").inputValue()) === "Sharma Dhaba", "phone: going back keeps the name");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("checkbox", { name: /Dine-in/ }).click();
    await page.getByRole("checkbox", { name: /Takeaway/ }).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByText("How many tables?").waitFor();
  await shot("tables");
  await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();

  await page.getByText("What do you sell?").waitFor();
  await shot("kinds");
  await page.getByRole("button", { name: "Biryani & meals" }).click();
  await page.getByText("Type the price of each dish you sell").waitFor();
  check(await page.getByRole("button", { name: "Add Dishes", exact: true }).isDisabled(), `${name}: nothing to add before a price`);
  await shot("list");
  await price(page, "Chicken Biryani").fill("180");
  await price(page, "Chicken Biryani").press("Enter");
  check(await page.evaluate(() => document.activeElement?.labels?.[0]?.textContent) === "Price of Mutton Biryani", `${name}: Return moves to the next price`);
  await price(page, "Veg Biryani").fill("140");
  await price(page, "Chicken 65").fill("18o");
  await page.getByRole("button", { name: "Add 3 Dishes" }).click();
  check(await page.getByText("Use a number like 120 or 120.50").isVisible(), `${name}: a price that doesn't read is pointed out`);
  await shot("list-error");
  await price(page, "Chicken 65").fill("180");
  const drinks = page.locator("section", { has: page.getByRole("heading", { name: "Drinks" }) });
  await drinks.getByRole("button", { name: "Add a Dish" }).click();
  await page.getByLabel("Dish name").last().fill("Kesar Lassi with a Very Long Name for a Phone");
  await page.getByLabel("Price of Kesar Lassi with a Very Long Name for a Phone").fill("60");
  await page.getByRole("button", { name: "Add 4 Dishes" }).click();
  check(await page.getByText("Veg, non-veg or egg?").isVisible(), `${name}: their own dish needs veg or not`);
  await page.getByRole("radio", { name: "Veg", exact: true }).last().click();
  await shot("list-own");
  await page.getByRole("button", { name: "Add 4 Dishes" }).dblclick();

  await page.getByText("You’re ready").waitFor();
  check(await page.getByText("6 tables · 4 dishes").isVisible(), `${name}: ready says 6 tables · 4 dishes`);
  await shot("ready");
  await page.getByRole("button", { name: "Start Taking Orders" }).click();
  await page.locator("a[href^='/tables/']").first().waitFor();
  check(page.url().endsWith("/tables") && (await page.locator("a[href^='/tables/']").count()) === 6, `${name}: starts on the floor, 6 tables`);
  check(await shows(page, "Sharma Dhaba"), `${name}: the header says Sharma Dhaba`);
  check(!(await page.getByText("Keep a copy of").isVisible()), `${name}: signed in, so no card`);
  check(await shows(page, "Tables"), `${name}: a dine-in restaurant keeps its Tables tab`);
  await shot("floor");
  await page.getByRole("link", { name: "Menu" }).first().click();
  await page.getByRole("heading", { name: "Menu", level: 1 }).waitFor();
  await shot("menu");
  const dishes = await page.evaluate(async () => {
    const idb = await new Promise((res) => { const o = indexedDB.open("tap2chef"); o.onsuccess = () => res(o.result); });
    const all = (n) => new Promise((res) => { const r = idb.transaction(n).objectStore(n).getAll(); r.onsuccess = () => res(r.result); });
    const [items, profiles] = [await all("items"), await all("menuProfiles")];
    idb.close();
    return { items: items.map((i) => i.name), profiles: profiles.map((p) => p.name) };
  });
  check(dishes.items.length === 4 && dishes.profiles.join() === "Dine-In", `${name}: 4 dishes on one Dine-In list (double tap added once)`);
  check(errors.length === 0, `${name}: no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

// --- A second phone of the same restaurant: straight in, nothing asked.
{
  const { ctx, page, errors, shot } = await open(360, 740, "light", "second-phone");
  await page.goto(`${BASE}/`);
  await page.getByText("Keep your restaurant safe").waitFor();
  await emailAndCode(page, firstEmail);
  await page.getByText("How many tables?").or(page.locator("a[href^='/tables/']")).first().waitFor();
  check(!(await page.getByText("What’s your restaurant called?").isVisible()), "second phone: not asked the name");
  await page.locator("a[href^='/tables/']").nth(5).waitFor({ timeout: 10_000 });
  check(await shows(page, "Sharma Dhaba"), "second phone: the floor and the name arrive");
  await shot("floor");
  check(errors.length === 0, `second phone: no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

// --- A takeaway kitchen, set up with no internet, signs in later through the card.
{
  const { ctx, page, errors, shot } = await open(360, 740, "light", "offline");
  const email = `setup-offline-${RUN}@example.com`;
  await page.goto(`${BASE}/`);
  await page.getByText("Keep your restaurant safe").waitFor();
  await ctx.setOffline(true);
  await page.getByText("No internet right now").waitFor();
  await shot("account-offline");
  check(!(await page.getByLabel("Email").isVisible()), "offline: the email waits for the internet");
  await page.getByRole("button", { name: "Set Up Now" }).click();
  await page.getByLabel("Restaurant name").fill("Chai Point");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("checkbox", { name: /Takeaway/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("What do you sell?").waitFor();
  check(true, "offline: takeaway only skips the tables");
  await page.getByRole("button", { name: "Something else" }).click();
  await page.getByLabel("Dish name").fill("Cutting Chai");
  await page.getByLabel("Price of Cutting Chai").fill("15");
  await page.getByRole("radio", { name: "Veg", exact: true }).click();
  await shot("own-list");
  await page.getByRole("button", { name: "Add 1 Dish" }).click();
  await page.getByText("Takeaway · 1 dish").waitFor();
  await page.getByRole("button", { name: "Start Taking Orders" }).click();
  await page.waitForURL(/\/orders$/);
  check(true, "offline: a takeaway kitchen starts on Orders");
  check(await shows(page, "Chai Point"), "offline: the header says Chai Point");
  check(!(await page.getByText("Keep a copy of").isVisible()), "offline: no card while it couldn't work");
  await shot("orders-offline");

  await ctx.setOffline(false);
  await page.getByText("Keep a copy of Chai Point safe").waitFor();
  await shot("card");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await emailAndCode(page, email);
  await page.getByText("Signed in", { exact: true }).waitFor();
  check(!(await page.getByLabel("Restaurant name").isVisible()), "card: the name already given is used, not asked again");
  await shot("signed-in");
  await page.getByRole("button", { name: "Done" }).click();
  check(!(await page.getByText("Keep a copy of").isVisible()), "card: gone once signed in");

  // 10d: a kitchen with no tables never meets them.
  const tabs = async () => page.getByRole("link").evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()).filter(Boolean));
  check(JSON.stringify(await tabs()) === JSON.stringify(["Orders", "Menu", "Expenses", "Today"]), `takeaway: four tabs (${(await tabs()).join(", ")})`);
  check(await page.getByText("Start a takeaway.", { exact: true }).isVisible(), "takeaway: the empty Orders says Start a takeaway.");
  await shot("takeaway-phone");
  for (const path of ["/", "/tables", "/somewhere"]) {
    await page.goto(`${BASE}${path}`);
    await page.getByRole("heading", { name: "Orders", level: 1 }).waitFor();
    check(page.url().endsWith("/orders"), `takeaway: ${path} opens Orders`);
  }
  await page.getByRole("button", { name: "Takeaway" }).click();
  await page.waitForURL(/\/orders\/.+/);
  check(true, "takeaway: one tap from home starts an order");
  await page.goto(`${BASE}/orders`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("heading", { name: "Orders", level: 1 }).waitFor();
  check(!(await shows(page, "Tables")), "takeaway: the desktop sidebar has no Tables either");
  await shot("takeaway-desktop");
  check(errors.length === 0, `offline: no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await ctx.close();
}

await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : "\nall passed");
process.exit(fail.length ? 1 : 0);
