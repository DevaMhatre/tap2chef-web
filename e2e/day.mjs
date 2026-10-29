import { chromium } from "playwright";
const S = new URL(".", import.meta.url).pathname;
const BASE = "http://localhost:5199";
const sizes = [[360, 740, "phone"], [820, 1180, "tablet"], [1440, 900, "desktop"]];
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };
const pad = (n) => String(n).padStart(2, "0");
const dayOf = (offset) => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const today = dayOf(0), yesterday = dayOf(-1);

const browser = await chromium.launch({ channel: "chrome" });
for (const scheme of ["light", "dark"]) {
  for (const [w, h, name] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const tag = `${name}-${scheme}`;
    const shot = async (n) => { await page.waitForTimeout(500); return page.screenshot({ path: `${S}/shots/${tag}-${n}.png` }); };

    await page.goto(`${BASE}/expenses`);
    await page.getByText("Nothing spent today").waitFor();
    await shot("1-expenses-empty");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal scroll (empty)`);

    // add one, double-tapping Save
    const add = async (amount, note, { method, yday } = {}) => {
      await page.getByRole("button", { name: "Expense", exact: true }).first().click();
      await page.getByLabel("Amount").fill(amount);
      await page.getByLabel("What for").fill(note);
      if (method) await page.getByRole("radio", { name: method }).click();
      if (yday) await page.getByRole("radio", { name: "Yesterday" }).click();
    };
    await add("340", "Vegetables");
    await shot("2-sheet-filled");
    await page.getByRole("button", { name: "Save Expense" }).dblclick();
    await page.getByText("Vegetables · ₹340 noted").waitFor();
    check((await page.getByText("Vegetables", { exact: true }).count()) === 1, `${tag}: double tap saves once`);
    await shot("3-after-save");

    // validation
    await page.getByRole("button", { name: "Expense", exact: true }).first().click();
    await page.getByRole("button", { name: "Save Expense" }).click();
    check(await page.getByText("Enter the amount, like 340 or 120.50.").isVisible(), `${tag}: amount error shown`);
    await page.getByLabel("Amount").fill("0");
    await page.getByLabel("What for").fill("x");
    await page.getByRole("button", { name: "Save Expense" }).click();
    check(await page.getByText("An expense can't be ₹0.").isVisible(), `${tag}: ₹0 refused`);
    await page.getByLabel("Amount").fill("12.505");
    await page.getByRole("button", { name: "Save Expense" }).click();
    check(await page.getByText("Enter the amount, like 340 or 120.50.").isVisible(), `${tag}: 12.505 refused`);
    await page.getByLabel("Amount").fill("60");
    await page.getByLabel("What for").fill("");
    await page.getByRole("button", { name: "Save Expense" }).click();
    check(await page.getByText("Say what it was for.").isVisible(), `${tag}: note required`);
    await shot("4-sheet-errors");
    await page.getByLabel("What for").fill("Gas");
    await page.getByRole("radio", { name: "UPI" }).click();
    await page.getByRole("button", { name: "Save Expense" }).click();
    await page.getByText("Gas · ₹60 noted").waitFor();

    // yesterday + a suggestion chip
    await page.getByRole("button", { name: "Expense", exact: true }).first().click();
    await page.getByLabel("Amount").fill("900");
    await page.getByRole("button", { name: "Gas", exact: true }).click();
    check((await page.getByLabel("What for").inputValue()) === "Gas", `${tag}: suggestion fills the note`);
    await page.getByRole("radio", { name: "Yesterday" }).click();
    await shot("5-sheet-yesterday");
    await page.getByRole("button", { name: "Save Expense" }).click();
    await page.getByText("Gas · ₹900 noted").waitFor();
    check(await page.getByText("Yesterday").first().isVisible(), `${tag}: yesterday section appears`);

    // undo of a note
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(300);
    check((await page.getByText("Yesterday").count()) === 0, `${tag}: undo takes the note away`);

    // remove + undo
    await page.getByText("Vegetables", { exact: true }).click();
    await shot("6-detail-sheet");
    await page.getByRole("button", { name: "Remove Expense" }).click();
    await page.getByText("Vegetables · ₹340 removed").waitFor();
    check(await page.locator(".line-through", { hasText: "Vegetables" }).isVisible(), `${tag}: removed stays, struck through`);
    await shot("7-removed");
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(300);
    check((await page.locator(".line-through", { hasText: "Vegetables" }).count()) === 0, `${tag}: undo restores it`);
    await shot("8-list");

    // seed bills straight into the local store
    await page.evaluate(async ({ today, yesterday }) => {
      const open = () => new Promise((res, rej) => { const r = indexedDB.open("tap2chef"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const db = await open();
      const base = { tenantId: "x", createdAt: 1, updatedAt: 1, deleted: false };
      const put = (store, rec) => new Promise((res, rej) => { const t = db.transaction(store, "readwrite"); t.objectStore(store).put({ ...base, ...rec }); t.oncomplete = res; t.onerror = () => rej(t.error); });
      const now = Date.now();
      const order = (id, day, status, state, token) => put("orders", { id, channel: { type: "takeaway", token }, profileId: "p", businessDate: day, openedAt: now - 5000, status, state });
      const line = (id, orderId, name, price, qty, state) => put("orderItems", { id, orderId, itemId: name, name, diet: "veg", unitPrice: price, quantity: qty, note: "", addedAt: now - 4000, state });
      const pay = (id, orderId, method, amount, extra = {}) => put("payments", { id, orderId, method, amount, receivedAt: now - 1000, ...extra });
      const sent = { status: "sent", roundId: "r", sentAt: now - 3000 };
      await order("o1", today, "settled", { status: "settled", billedAt: now - 2000, settledAt: now - 1000, subtotal: 50000 }, 1);
      await line("l1", "o1", "Paneer Butter Masala", 25000, 2, sent);
      await pay("p1", "o1", "cash", 50000);
      await order("o2", today, "settled", { status: "settled", billedAt: now - 2000, settledAt: now - 1000, subtotal: 30000, discount: { amount: 3000, reason: "Regular" } }, 2);
      await line("l2", "o2", "Dal Tadka", 15000, 2, sent);
      await line("l3", "o2", "Tea", 2000, 3, { status: "voided", roundId: "r", sentAt: now - 3000, voidedAt: now - 2500 });
      await pay("p2", "o2", "upi", 27000, { correctedAt: now - 500 });
      await pay("p3", "o2", "cash", 27000, { removedAt: now - 400 });
      await order("o3", yesterday, "settled", { status: "settled", billedAt: now - 2000, settledAt: now - 1000, subtotal: 80000 }, 9);
      await line("l4", "o3", "Biryani", 40000, 2, sent);
      await pay("p4", "o3", "upi", 80000);
      await order("o4", today, "billed", { status: "billed", billedAt: now - 2000 }, 3);
      await line("l5", "o4", "Roti", 2000, 6, sent);
      await pay("p5", "o4", "cash", 4000);
      db.close();
    }, { today, yesterday });

    await page.getByRole("link", { name: "Today" }).first().click();
    await page.getByText("Sales", { exact: true }).waitFor();
    await shot("9-today");
    const text = await page.locator("main").innerText();
    // sales: cash 500+40 = 540, upi 270; spent: cash 340, upi 60 (yesterday's 900 undone)
    check(text.includes("₹810"), `${tag}: sales ₹810`);
    check(text.includes("Cash ₹540 · UPI ₹270"), `${tag}: sales by drawer`);
    check(text.includes("₹400"), `${tag}: spent ₹400`);
    check(text.includes("Taken less spent") && text.includes("₹200") && text.includes("Add what the drawer started with"), `${tag}: cash movement ₹200 before a start is stated`);
    check(text.includes("Not paid yet") && text.includes("₹80"), `${tag}: unpaid ₹80`);
    check(text.includes("Cancelled after sending"), `${tag}: cancelled shown`);
    check(text.includes("Payments removed") && text.includes("Payments corrected") && text.includes("Discounts"), `${tag}: honesty items shown`);
    check(text.includes("Paneer Butter Masala"), `${tag}: top dish`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal scroll (today)`);

    // yesterday's bill, paid on a later day, reads under yesterday
    await page.getByRole("button", { name: "Earlier day" }).click();
    await page.getByRole("heading", { name: "Yesterday" }).waitFor();
    await page.getByText("₹800").first().waitFor();
    await shot("10-yesterday");
    check((await page.locator("main").innerText()).includes("Biryani"), `${tag}: yesterday shows its own bill`);

    // count yesterday's drawer: it becomes today's start
    await page.getByRole("button", { name: /^Counted/ }).click();
    await page.getByLabel("Cash in the drawer now").fill("x");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    check(await page.getByText("Enter the amount, like 1500 or 120.50.").isVisible(), `${tag}: bad count refused`);
    await page.getByLabel("Cash in the drawer now").fill("800");
    await shot("10b-count-sheet");
    await page.getByRole("button", { name: "Save", exact: true }).dblclick();
    await page.waitForTimeout(400);
    check((await page.locator("main").innerText()).includes("₹800"), `${tag}: yesterday's count saved`);

    await page.getByRole("button", { name: "Earlier day" }).click();
    await page.getByText("Nothing on this day").waitFor();
    await shot("11-empty-day");
    check(await page.getByText("Cash drawer", { exact: true }).isVisible(), `${tag}: drawer shown even on an empty day`);
    check(await page.getByRole("button", { name: "Later day" }).isEnabled(), `${tag}: can step forward`);
    await page.getByRole("button", { name: "Later day" }).click();
    await page.getByRole("button", { name: "Later day" }).click();
    await page.getByRole("heading", { name: "Today" }).waitFor();
    check(await page.getByRole("button", { name: "Later day" }).isDisabled(), `${tag}: no day after today`);

    // today starts with what yesterday's count left: 800 + (540 - 340)
    await page.getByText("Carried from yesterday's count").waitFor();
    let t = await page.locator("main").innerText();
    check(t.includes("Should hold") && t.includes("₹1,000") && t.includes("Carried from yesterday's count"), `${tag}: carried start ₹800, should hold ₹1,000`);
    await shot("12-carried");
    await page.getByRole("button", { name: /^Started with/ }).click();
    check((await page.getByLabel("Cash the drawer started with").inputValue()) === "800", `${tag}: opening sheet starts from the carried amount`);
    await page.getByLabel("Cash the drawer started with").fill("500");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(400);
    t = await page.locator("main").innerText();
    check(t.includes("₹700") && !t.includes("Carried from yesterday's count"), `${tag}: stated start ₹500, should hold ₹700`);

    await page.getByRole("button", { name: /^Counted/ }).click();
    check(await page.getByText("It should hold ₹700.").isVisible(), `${tag}: count sheet says what it should hold`);
    await page.getByLabel("Cash in the drawer now").fill("680");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Short ₹20").waitFor();
    await shot("13-short");
    await page.getByRole("button", { name: /^Counted/ }).click();
    check((await page.getByLabel("Cash in the drawer now").inputValue()) === "680", `${tag}: reopening shows the stored count`);
    await page.getByLabel("Cash in the drawer now").fill("720");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Over ₹20").waitFor();
    await page.getByRole("button", { name: /^Counted/ }).click();
    await page.getByLabel("Cash in the drawer now").fill("700");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Matches").waitFor();
    await shot("14-matches");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal scroll (drawer)`);

    check(errors.length === 0, `${tag}: no console errors ${errors.join("|")}`);
    await ctx.close();
  }
}
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/today`);
  await page.getByText("Nothing yet today").waitFor();
  await page.getByRole("button", { name: /^Started with/ }).click();
  await page.getByLabel("Cash the drawer started with").fill("1500");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(400);
  const t = await page.locator("main").innerText();
  check(t.includes("Should hold") && t.includes("₹1,500"), "morning: float entered before the first sale");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${S}/shots/phone-light-15-morning.png` });
  await ctx.close();
}
await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : "\nALL OK");
process.exit(fail.length ? 1 : 0);
