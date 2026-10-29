// Two devices, one restaurant (step 8d): the waiter's phone and the counter tablet.
// Needs the API (cd server && npm run dev:memory > api.log) and the dev server on :5199.
// Usage: node sync.mjs <path to api.log>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const S = new URL(".", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const LOG = process.argv[2];
const EMAIL = `owner-sync-${Date.now().toString(36)}@example.com`;
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };
const codeFor = (email) => [...readFileSync(LOG, "utf8").matchAll(new RegExp(`Sign-in code for ${email}: (\\d{6})`, "g"))].at(-1)?.[1];

const browser = await chromium.launch({ channel: "chrome" });
async function device(w, h, scheme, name) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d|ERR_INTERNET_DISCONNECTED/.test(m.text()) && errors.push(m.text()));
  const shot = async (n) => { await page.waitForTimeout(500); return page.screenshot({ path: `${S}/shots/sync-${name}-${n}.png` }); };
  return { ctx, page, errors, shot, name };
}

async function signIn({ page }, restaurant) {
  await page.getByRole("button", { name: /^Saved / }).click();
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Enter the code sent to").waitFor();
  let code;
  for (let i = 0; i < 30 && !code; i++) { code = codeFor(EMAIL); if (!code) await page.waitForTimeout(100); }
  await page.getByLabel("6-digit code").fill(code);
  if (restaurant) {
    await page.getByLabel("Restaurant name").fill(restaurant);
    await page.getByRole("button", { name: "Finish signing in" }).click();
  }
  await page.getByText("Signed in", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Done" }).click();
}

/** How long until `text` shows on `page`, in ms; fails after 10 s. */
async function arrives(page, locator) {
  const start = Date.now();
  await locator.waitFor({ timeout: 10_000 }).catch(() => {});
  return (await locator.isVisible()) ? Date.now() - start : undefined;
}

// --- The waiter's phone: a menu, six tables, then signs in.
const phone = await device(360, 740, "light", "phone");
await phone.page.goto(`${BASE}/tables`);
await phone.page.waitForSelector("text=How many tables?");
await phone.page.evaluate(async () => {
  const open = indexedDB.open("tap2chef");
  const idb = await new Promise((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = rej)));
  const meta = { accountId: "seed", createdAt: 1, updatedAt: 1, deleted: false };
  const tx = idb.transaction(["menuProfiles", "categories", "items", "outbox"], "readwrite");
  // Seeded as the app writes: every row with its outbox entry, so it syncs.
  const put = (table, row) => { tx.objectStore(table).put({ ...meta, ...row }); tx.objectStore("outbox").add({ table, recordId: row.id, queuedAt: 1 }); };
  put("menuProfiles", { id: "dine", name: "Dine-In", sortKey: "1" });
  put("categories", { id: "Starters", name: "Starters", sortKey: "1" });
  put("categories", { id: "Breads", name: "Breads", sortKey: "2" });
  put("items", { id: "i1", name: "Paneer Tikka", categoryId: "Starters", diet: "veg", sortKey: "1", prices: { dine: { kind: "fixed", price: 24000 } } });
  put("items", { id: "i2", name: "Butter Naan", categoryId: "Breads", diet: "veg", sortKey: "2", prices: { dine: { kind: "fixed", price: 5000 } } });
  await new Promise((res) => (tx.oncomplete = res));
  idb.close();
});
await phone.page.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await phone.page.waitForSelector("a[href^='/tables/']");
await signIn(phone, "Sharma Dhaba");
check(await arrives(phone.page, phone.page.getByText("Saved online")) !== undefined, "phone: says Saved online once everything is sent");
await phone.shot("1-signed-in");

// --- The counter tablet joins the same restaurant and gets everything.
const tablet = await device(820, 1180, "dark", "tablet");
await tablet.page.goto(`${BASE}/tables`);
await tablet.page.waitForSelector("text=How many tables?");
await signIn(tablet);
check(await arrives(tablet.page, tablet.page.locator("a[href^='/tables/']").nth(5)) !== undefined, "tablet: the phone's six tables arrive");
check(await arrives(tablet.page, tablet.page.getByText("Saved online")) !== undefined, "tablet: says Saved online");
await tablet.shot("1-joined");

// --- The waiter sends table 4; the counter sees it.
await phone.page.locator("a[href^='/tables/']").nth(3).click();
await phone.page.getByRole("button", { name: /^Paneer Tikka,/ }).click();
await phone.page.getByRole("button", { name: /^Butter Naan,/ }).click();
await phone.page.getByRole("button", { name: "Send", exact: true }).click();
await phone.page.waitForURL(/\/tables$/);
const sent = await arrives(tablet.page, tablet.page.getByText("₹290").first());
check(sent !== undefined && sent < 5000, `tablet: table 4's order arrives within 5 s (${sent} ms)`);
await tablet.shot("2-order-arrived");

// --- The counter bills it; the waiter's floor shows the table waiting to pay.
await tablet.page.locator("a[href^='/tables/']").nth(3).click();
await tablet.page.getByRole("button", { name: "Bill", exact: true }).click();
await tablet.page.getByRole("dialog", { name: "Table 4" }).getByRole("button", { name: "Back" }).click();
await tablet.page.goto(`${BASE}/tables`);
const billed = await arrives(phone.page, phone.page.getByText(/waiting to be paid/));
check(billed !== undefined, `phone: the bill handed over at the counter shows on the floor (${billed} ms)`);
await phone.shot("2-billed");

// --- The phone loses its connection: work goes on, and arrives when it's back.
await phone.page.getByRole("link", { name: "Expenses" }).click();
await phone.ctx.setOffline(true);
await phone.page.getByRole("button", { name: "Expense", exact: true }).first().click();
await phone.page.getByLabel("Amount").fill("50");
await phone.page.getByLabel("What for").fill("Milk");
await phone.page.getByRole("button", { name: "Save Expense" }).click();
await phone.page.getByText("Milk · ₹50 noted").waitFor();
check(await arrives(phone.page, phone.page.getByText("Saved on this device")) !== undefined, "phone offline: says Saved on this device, no warning");
await phone.shot("3-offline");
await tablet.page.getByRole("link", { name: "Expenses" }).click();
await tablet.page.waitForTimeout(4000);
check((await tablet.page.getByText("Milk").count()) === 0, "tablet: nothing arrives while the phone is offline");
await phone.ctx.setOffline(false);
const back = await arrives(tablet.page, tablet.page.getByText("Milk").first());
check(back !== undefined, `tablet: the expense arrives once the phone is back (${back} ms)`);
check(await arrives(phone.page, phone.page.getByText("Saved online")) !== undefined, "phone: back to Saved online");
await tablet.shot("3-expense-arrived");

for (const d of [phone, tablet]) check(d.errors.length === 0, `${d.name}: no console errors ${d.errors.join(" | ")}`);
await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : "\nall passed");
process.exit(fail.length ? 1 : 0);
