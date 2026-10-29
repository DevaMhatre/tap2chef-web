// Signing a device in (step 8c). Needs the API (cd server && npm run dev:memory > api.log)
// and the dev server on :5199. Usage: node account.mjs <path to api.log>
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const S = new URL(".", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const LOG = process.argv[2];
const RUN = Date.now().toString(36);
const sizes = [[360, 740, "phone"], [820, 1180, "tablet"], [1440, 900, "desktop"]];
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };
const codeFor = (email) => [...readFileSync(LOG, "utf8").matchAll(new RegExp(`Sign-in code for ${email}: (\\d{6})`, "g"))].at(-1)?.[1];
const meta = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open("tap2chef");
  r.onsuccess = () => { const q = r.result.transaction("meta").objectStore("meta").getAll(); q.onsuccess = () => { res(Object.fromEntries(q.result.map((m) => [m.key, m.value]))); r.result.close(); }; };
}));
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

const browser = await chromium.launch({ channel: "chrome" });
async function open(w, h, scheme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A refused code is a 400 the browser logs; anything else is a fault.
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && errors.push(m.text()));
  return { ctx, page, errors };
}
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

let firstAccount, firstEmail;
for (const scheme of ["light", "dark"]) {
  for (const [w, h, name] of sizes) {
    const tag = `${name}-${scheme}`;
    const { ctx, page, errors } = await open(w, h, scheme);
    const shot = async (n) => { await page.waitForTimeout(500); return page.screenshot({ path: `${S}/shots/account-${tag}-${n}.png` }); };
    const email = `owner-${tag}-${RUN}@example.com`;

    await page.goto(`${BASE}/expenses`);
    await page.getByText("Nothing spent today").waitFor();
    // Something noted before signing in must stay this device's, in its account.
    await page.getByRole("button", { name: "Expense", exact: true }).first().click();
    await page.getByLabel("Amount").fill("340"); await page.getByLabel("What for").fill("Vegetables");
    await page.getByRole("button", { name: "Save Expense" }).click();
    await page.getByText("Vegetables · ₹340 noted").waitFor();
    const before = await meta(page);

    await page.getByRole("button", { name: /^Saved / }).click();
    await page.getByRole("dialog", { name: "Keep a Copy Safe" }).waitFor();
    await shot("1-email");
    await page.getByLabel("Email").fill("owner@");
    await page.getByRole("button", { name: "Send code" }).click();
    check(await page.getByText("Enter your email, like").isVisible(), `${tag}: a bad email is caught`);

    await page.getByLabel("Email").fill(`  ${email.toUpperCase()} `);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByText("Enter the code sent to").waitFor();
    check(await page.getByText(email).isVisible(), `${tag}: says where the code went`);
    check(await page.getByRole("button", { name: /Send again in \d+s/ }).isDisabled(), `${tag}: send again waits`);
    await shot("2-code");
    check(await noScroll(page), `${tag}: no horizontal scroll (code)`);

    let code;
    for (let i = 0; i < 20 && !code; i++) { code = codeFor(email); if (!code) await page.waitForTimeout(100); }
    check(Boolean(code), `${tag}: a code was sent`);
    await page.getByLabel("6-digit code").fill(wrong(code));
    await page.getByText("That code isn't right").waitFor();
    check((await page.getByLabel("6-digit code").inputValue()) === "", `${tag}: a wrong code is cleared`);
    await shot("3-wrong");

    await page.getByLabel("6-digit code").fill(code);
    await page.getByText("what is your restaurant called").waitFor();
    await page.getByRole("button", { name: "Finish signing in" }).click();
    check(await page.getByText("Enter the restaurant's name.").isVisible(), `${tag}: the name is needed`);
    await page.getByLabel("Restaurant name").fill("Sharma Dhaba");
    await shot("4-name");
    await page.getByRole("button", { name: "Finish signing in" }).dblclick();
    await page.getByText("Signed in", { exact: true }).waitFor();
    await shot("5-signed-in");
    const after = await meta(page);
    check(after.accountId === before.accountId && after.shopId === before.shopId, `${tag}: a new owner's account is this device's own`);
    check(JSON.parse(after.session ?? "{}").restaurantName === "Sharma Dhaba" && Boolean(after.deviceToken), `${tag}: the session is kept`);

    check(await page.getByRole("button", { name: "Done" }).isVisible() && !(await page.getByRole("button", { name: "Cancel" }).isVisible()), `${tag}: once signed in, the sheet closes with Done`);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: /^Saved / }).click();
    await page.getByRole("dialog", { name: "Account" }).waitFor();
    check(await page.getByText(email).isVisible(), `${tag}: reopening says who is signed in`);
    await shot("6-account");
    check(await noScroll(page), `${tag}: no horizontal scroll (account)`);
    await page.getByRole("button", { name: "Done" }).click();
    check(await page.getByText("Vegetables").first().isVisible(), `${tag}: the expense is still there`);

    if (!firstAccount) { firstAccount = after.accountId; firstEmail = email; }
    check(errors.length === 0, `${tag}: no console errors ${errors.join(" | ")}`);
    await ctx.close();
  }
}

// A second phone signing in to the same restaurant: no name asked, its records join the account.
{
  const { ctx, page, errors } = await open(360, 740, "light");
  await page.goto(`${BASE}/expenses`);
  await page.getByText("Nothing spent today").waitFor();
  await page.getByRole("button", { name: /^Saved / }).click();
  await page.getByLabel("Email").fill(firstEmail);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Enter the code sent to").waitFor();
  await page.waitForTimeout(300);
  await page.getByLabel("6-digit code").fill(codeFor(firstEmail));
  await page.getByText("Signed in", { exact: true }).waitFor();
  check((await meta(page)).accountId === firstAccount, "second phone: joins the first phone's account");
  await page.screenshot({ path: `${S}/shots/account-second-phone.png` });
  check(errors.length === 0, `second phone: no console errors ${errors.join(" | ")}`);
  await ctx.close();
}

// Offline: the sheet says so, and nothing else stops.
{
  const { ctx, page } = await open(360, 740, "dark");
  await page.goto(`${BASE}/expenses`);
  await page.getByText("Nothing spent today").waitFor();
  await ctx.setOffline(true);
  await page.getByRole("button", { name: /^Saved / }).click();
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Signing in needs the internet").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${S}/shots/account-offline.png` });
  check(true, "offline: says signing in needs the internet");
  await ctx.close();
}

await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : "\nall passed");
process.exit(fail.length ? 1 : 0);
