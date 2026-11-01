// Several phones in one restaurant: the owner's phone and a waiter's phone
// joined to it. The waiter, offline, starts table 2 while the counter starts
// it too: once the waiter is back, both phones show one bill with both
// dishes. Both start a takeaway the same way: both get token 1, and both
// phones say so on the two rows.
// Needs the API (cd server && npm run dev:memory > api.log) and the dev server on :5199.
// Usage: node together.mjs <path to api.log>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const S = new URL(".", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const LOG = process.argv[2];
const EMAIL = `owner-together-${Date.now().toString(36)}@example.com`;
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };
const codeFor = (email) => [...readFileSync(LOG, "utf8").matchAll(new RegExp(`Sign-in code for ${email}: (\\d{6})`, "g"))].at(-1)?.[1];

const browser = await chromium.launch({ channel: "chrome" });
async function device(name, scheme) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text()) && errors.push(m.text()));
  const shot = async (label) => { await page.waitForTimeout(500); await page.screenshot({ path: `${S}shots/together-${name}-${label}.png` }); };
  return { ctx, page, errors, shot, name };
}
const table = (page, n) => page.locator("a[href^='/tables/']").nth(n - 1);
const dish = (page, name) => page.getByRole("button", { name: new RegExp(`^${name},`) });

async function order(page, dishName) {
  await dish(page, dishName).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

// --- The owner sets up, with two dishes.
const owner = await device("owner", "light");
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
  await page.getByRole("checkbox", { name: /Takeaway/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
  await page.getByRole("button", { name: "Biryani & meals" }).click();
  await page.getByLabel("Price of Chicken Biryani", { exact: true }).fill("180");
  await page.getByLabel("Price of Veg Biryani", { exact: true }).fill("140");
  await page.getByRole("button", { name: "Add 2 Dishes" }).click();
  await page.getByRole("button", { name: "Start Taking Orders" }).click();
  await table(page, 1).waitFor();
  await page.getByRole("button", { name: /Sharma Dhaba/ }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Add a Phone" }).click();
  await page.getByLabel("Whose phone is it?").fill("Ravi");
  await page.getByRole("radio", { name: "No", exact: true }).click();
  await page.getByRole("button", { name: "Show Code" }).click();
}
const img = owner.page.getByRole("img", { name: /A code to join/ });
await img.waitFor();
const code = (await img.getAttribute("aria-label")).match(/\d{6}/)[0];

// --- The waiter's phone joins.
const waiter = await device("waiter", "dark");
await waiter.page.goto(`${BASE}/join#${code}`);
await waiter.page.getByRole("button", { name: "Join", exact: true }).click();
await waiter.page.getByRole("button", { name: "Start Taking Orders" }).click();
await table(waiter.page, 6).waitFor({ timeout: 10_000 });
await owner.page.getByRole("button", { name: "Done" }).click();

// --- Table 2, started on both phones, one of them offline.
await waiter.ctx.setOffline(true);
await table(waiter.page, 2).click();
await dish(waiter.page, "Chicken Biryani").waitFor({ timeout: 10_000 });
await order(waiter.page, "Chicken Biryani");
await table(owner.page, 2).click();
await order(owner.page, "Veg Biryani");
await waiter.ctx.setOffline(false);

// The proof is the Orders list: one Table 2 row, at both dishes' total.
for (const d of [owner, waiter]) {
  await d.page.getByRole("link", { name: "Orders" }).click();
  await d.page.getByRole("heading", { name: "Orders", level: 1 }).waitFor();
  const start = Date.now();
  const row = d.page.getByRole("button", { name: /^Table 2/ });
  await row.filter({ hasText: "₹320" }).waitFor({ timeout: 15_000 }).catch(() => {});
  const rows = await row.allTextContents();
  check(rows.length === 1 && rows[0].includes("₹320"), `${d.name}: one Table 2 bill at ₹320 (${JSON.stringify(rows)}, ${Date.now() - start} ms)`);
  await d.shot("orders-table-2");
}

// --- A takeaway each, the waiter offline: both are token 1.
await waiter.ctx.setOffline(true);
for (const d of [waiter, owner]) {
  await d.page.getByRole("button", { name: "Takeaway", exact: false }).first().click();
  await order(d.page, "Chicken Biryani");
  await d.page.getByRole("heading", { name: "Orders", level: 1 }).waitFor();
}
await waiter.ctx.setOffline(false);
for (const d of [owner, waiter]) {
  const start = Date.now();
  await d.page.getByText("· twice").nth(1).waitFor({ timeout: 15_000 }).catch(() => {});
  const twice = await d.page.getByText("· twice").count();
  check(twice === 2, `${d.name}: both Token 1 rows say twice (${twice}, ${Date.now() - start} ms)`);
  await d.shot("orders");
}

// --- Ravi bills table 2 and takes the cash: no discount on his phone; "by Ravi" on the owner's.
{
  const { page } = waiter;
  await page.getByRole("link", { name: "Tables" }).click();
  await table(page, 2).click();
  await page.getByRole("button", { name: "Bill", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Table 2" });
  await sheet.getByRole("radio", { name: "Cash" }).waitFor();
  check(!(await sheet.getByRole("button", { name: "Round off or discount" }).isVisible()), "waiter: no discount on his phone");
  await waiter.shot("bill-no-discount");
  await sheet.getByRole("radio", { name: "Cash" }).click();
  await sheet.getByRole("button", { name: /^Settle ₹320/ }).click();
  await page.waitForTimeout(1500);
}
{
  const { page } = owner;
  await page.getByRole("link", { name: "Orders" }).click();
  await page.getByRole("button", { name: /^Settled today/ }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Settled today/ }).click();
  await page.getByRole("button", { name: /^Table 2/ }).click();
  await page.getByText(/by Ravi/).waitFor({ timeout: 10_000 });
  check(true, "owner: the settled bill says the cash was taken by Ravi");
  await owner.shot("settled-by-ravi");
}

for (const d of [owner, waiter]) check(d.errors.length === 0, `${d.name}: no console errors${d.errors.length ? `: ${d.errors.join(" | ")}` : ""}`);
await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : "\nall passed");
process.exit(fail.length ? 1 : 0);
