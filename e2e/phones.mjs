// Step 10f: adding and removing phones. The owner's iPhone sets up, shows a
// code; the waiter's Android joins from the link (as a camera scan opens it),
// works at once, sees the details but can't change them; the owner removes
// it and it clears itself. Also: joining by a typed code, and a phone that
// already keeps a restaurant refusing to join.
// Needs the API (cd server && npm run dev:memory > api.log) and the dev server on :5199.
// Usage: node phones.mjs <path to api.log>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { skipSetup } from "./skipSetup.mjs";

const S = new URL(".", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const LOG = process.argv[2];
const EMAIL = `owner-phones-${Date.now().toString(36)}@example.com`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };
const codeFor = (email) => [...readFileSync(LOG, "utf8").matchAll(new RegExp(`Sign-in code for ${email}: (\\d{6})`, "g"))].at(-1)?.[1];

const browser = await chromium.launch({ channel: "chrome" });
async function device(name, { w = 360, h = 740, scheme = "light", ua }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2, userAgent: ua });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
  let n = 0;
  const shot = async (label) => {
    await page.waitForTimeout(500);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errors.push(`horizontal scroll at ${label}`);
    await page.screenshot({ path: `${S}shots/phones-${name}-${String(++n).padStart(2, "0")}-${label}.png` });
  };
  return { ctx, page, errors, shot };
}
const door = (page, name) => page.getByRole("button", { name: new RegExp(name) }).filter({ visible: true }).first();

// --- The owner's iPhone: a quick setup.
const owner = await device("owner", { ua: IPHONE });
{
  const { page } = owner;
  await page.goto(`${BASE}/`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Enter the code sent to").waitFor();
  let code;
  for (let i = 0; i < 30 && !code; i++) { code = codeFor(EMAIL); if (!code) await page.waitForTimeout(100); }
  await page.getByLabel("6-digit code").fill(code);
  await page.getByLabel("Restaurant name").fill("Sharma Dhaba");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("checkbox", { name: /Dine-in/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /Set Up \d+ Tables/ }).click();
  await page.getByRole("button", { name: "Biryani & meals" }).click();
  await page.getByLabel("Price of Chicken Biryani", { exact: true }).fill("180");
  await page.getByRole("button", { name: "Add 1 Dish" }).click();
  await page.getByRole("button", { name: "Start Taking Orders" }).click();
  await page.locator("a[href^='/tables/']").first().waitFor();
}

// --- The owner shows a code.
await door(owner.page, "Sharma Dhaba").click();
await owner.page.getByRole("heading", { name: "Phones" }).waitFor();
await owner.page.getByText("This phone").waitFor();
check(await owner.page.getByText("iPhone", { exact: true }).isVisible(), "owner: its own phone is listed as iPhone, This phone");
await owner.shot("restaurant-sheet");
await owner.page.getByRole("button", { name: "Add a Phone" }).click();
await owner.page.getByRole("img", { name: /A code to join/ }).waitFor();
const shownCode = (await owner.page.getByRole("img", { name: /A code to join/ }).getAttribute("aria-label")).match(/\d{6}/)[0];
check(/^\d{6}$/.test(shownCode), `owner: a QR and a 6-digit code (${shownCode})`);
await owner.shot("add-phone");

// --- The waiter's Android opens the link the QR holds.
const waiter = await device("waiter", { scheme: "dark", ua: ANDROID });
await waiter.page.goto(`${BASE}/join#${shownCode}`);
await waiter.page.getByRole("heading", { name: "Join Sharma Dhaba?" }).waitFor();
check(true, "waiter: the link asks to join Sharma Dhaba");
await waiter.shot("confirm");
await waiter.page.getByRole("button", { name: "Join", exact: true }).dblclick();
await waiter.page.getByText("You’re in").waitFor();
await waiter.shot("joined");
await waiter.page.getByRole("button", { name: "Start Taking Orders" }).click();
await waiter.page.locator("a[href^='/tables/']").first().waitFor({ timeout: 10_000 });
check(await door(waiter.page, "Sharma Dhaba").isVisible(), "waiter: the floor and the name arrive, no setup");

const joinedAt = Date.now();
await owner.page.getByText("Android phone joined").waitFor({ timeout: 10_000 });
check(Date.now() - joinedAt < 6000, `owner: sees "Android phone joined" (${Date.now() - joinedAt} ms)`);
await owner.shot("phone-joined");
await owner.page.getByRole("button", { name: "Done" }).click();

// --- The waiter sees the details, can't change them, and sees no phones.
await door(waiter.page, "Sharma Dhaba").click();
await waiter.page.getByText("Only the owner’s phone can change these.").waitFor();
check(await waiter.page.getByLabel("Name").isDisabled(), "waiter: the details can't be changed");
check(!(await waiter.page.getByRole("button", { name: "Save", exact: true }).isVisible()), "waiter: no Save");
check(!(await waiter.page.getByRole("heading", { name: "Phones" }).isVisible()), "waiter: no phones list");
await waiter.shot("restaurant-read-only");
await waiter.page.getByRole("button", { name: "Done" }).click();

// --- The owner removes it; it clears itself.
await door(owner.page, "Sharma Dhaba").click();
await owner.page.getByText("Android phone", { exact: true }).waitFor();
check(await owner.page.getByText("active now").isVisible(), "owner: the Android phone is active now");
await owner.page.getByRole("button", { name: "Remove", exact: true }).click();
await owner.page.getByText("Anything it hasn’t sent yet is lost").waitFor();
await owner.shot("remove");
await owner.page.getByRole("button", { name: "Remove Android phone" }).dblclick();
await owner.page.getByRole("heading", { name: "Phones" }).waitFor();
await owner.page.waitForTimeout(800);
check(!(await owner.page.getByText("Android phone", { exact: true }).isVisible()), "owner: back on the sheet, the phone is gone");
await owner.shot("after-remove");
await owner.page.getByRole("button", { name: "Cancel" }).click();

const removedAt = Date.now();
await waiter.page.getByText("Keep your restaurant safe").waitFor({ timeout: 15_000 });
check(true, `waiter: cleared, starts again as a new phone (${Date.now() - removedAt} ms)`);
const left = await waiter.page.evaluate(async () => {
  const idb = await new Promise((res) => { const o = indexedDB.open("tap2chef"); o.onsuccess = () => res(o.result); });
  const count = (n) => new Promise((res) => { const r = idb.transaction(n).objectStore(n).count(); r.onsuccess = () => res(r.result); });
  const out = { items: await count("items"), diningTables: await count("diningTables"), shopDetails: await count("shopDetails") };
  idb.close();
  return out;
});
check(left.items + left.diningTables + left.shopDetails === 0, `waiter: none of the restaurant left (${JSON.stringify(left)})`);
await waiter.shot("cleared");

// --- Joining by a typed code, after a wrong one.
const counter = await device("counter", { w: 820, h: 1180, ua: ANDROID });
{
  const { page } = counter;
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Joining a restaurant? Enter its code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByText("That code isn’t right").waitFor();
  check((await page.getByLabel("6-digit code").inputValue()) === "", "counter: a wrong code is cleared");
  await counter.shot("wrong-code");
  await door(owner.page, "Sharma Dhaba").click();
  await owner.page.getByRole("button", { name: "Add a Phone" }).click();
  const img = owner.page.getByRole("img", { name: /A code to join/ });
  await img.waitFor();
  const fresh = (await img.getAttribute("aria-label")).match(/\d{6}/)[0];
  await page.getByLabel("6-digit code").fill(fresh);
  await page.getByRole("heading", { name: "Join Sharma Dhaba?" }).waitFor();
  await page.getByRole("button", { name: "Not this restaurant" }).click();
  await page.getByLabel("6-digit code").fill(fresh);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByText("You’re in").waitFor();
  check(true, "counter: joins by the typed code");
  await owner.page.getByText("Android tablet joined").or(owner.page.getByText("Android phone joined")).waitFor({ timeout: 10_000 });
  await owner.page.getByRole("button", { name: "Done" }).click();
}

// --- A phone that keeps its own restaurant won't join another.
const busy = await device("busy", { ua: ANDROID });
{
  const { page } = busy;
  await skipSetup(page, `${BASE}/expenses`);
  await page.getByRole("button", { name: "Expense", exact: true }).first().click();
  await page.getByLabel("Amount").fill("50");
  await page.getByLabel("What for").fill("Milk");
  await page.getByRole("button", { name: "Save Expense" }).click();
  await page.getByText("Milk", { exact: true }).waitFor();
  await page.goto(`${BASE}/join#123456`);
  await page.getByText("This phone has its own restaurant").waitFor();
  check(true, "busy: a phone with records won't join");
  await busy.shot("taken");
}

// --- Desktop, dark: the owner's sheet with its phones.
await owner.page.setViewportSize({ width: 1440, height: 900 });
await owner.page.emulateMedia({ colorScheme: "dark" });
await door(owner.page, "Sharma Dhaba").click();
await owner.page.getByText("This phone").waitFor();
await owner.shot("desktop-dark");

for (const d of [owner, waiter, counter, busy]) check(d.errors.length === 0, `no console errors${d.errors.length ? `: ${d.errors.join(" | ")}` : ""}`);
await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : "\nall passed");
process.exit(fail.length ? 1 : 0);
