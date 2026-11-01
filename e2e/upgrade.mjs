// A storage upgrade meets the live build twice (LEARNINGS, Data 6): what the
// live build wrote is upgraded and still shows, and a live-build tab left open
// during the upgrade keeps working. Written for the Dexie v8 bump (step 10a,
// the menu moves into a brand), v9 (10c, the setup: a phone with records
// never sees it) and v10 (11b, money regulars pay back); adjust the checks
// for the next one.
//
// Build both first: the live one from a worktree of the deployed commit
// (`git worktree add <dir> <commit>`, link client/node_modules, `npx vite build`)
// and this one (`cd client && npm run build`).
// Usage: node upgrade.mjs <live client/dist> <new client/dist>
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const [LIVE, NEW] = process.argv.slice(2).map((p) => new URL(p, `file://${process.cwd()}/`).pathname);
const CLIENT = new URL("../client/", import.meta.url).pathname;
const S = new URL("./shots/", import.meta.url).pathname;
const PORT = 5197;
const BASE = `http://localhost:${PORT}`;
const fail = [];
const check = (cond, msg) => { if (!cond) { fail.push(msg); console.log("FAIL", msg); } else console.log("ok  ", msg); };

/** Serves a built dist on the one origin both builds share, as the live site would. */
async function serve(dist) {
  const server = spawn("npx", ["vite", "preview", "--outDir", dist, "--port", String(PORT), "--strictPort"], { cwd: CLIENT });
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => String(d).includes(String(PORT)) && resolve());
    server.on("exit", (code) => reject(new Error(`vite preview exited ${code}`)));
  });
  return server;
}
const stop = (server) => new Promise((resolve) => { server.removeAllListeners("exit"); server.on("exit", resolve); server.kill(); });

/** Everything in the local database, read raw so no build's code stands in between. */
const dump = (page) => page.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const o = indexedDB.open("tap2chef"); o.onsuccess = () => res(o.result); o.onerror = rej; });
  const all = (name) => new Promise((res) => { const r = idb.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result); });
  const names = [...idb.objectStoreNames];
  const out = { version: idb.version };
  for (const name of names) out[name] = await all(name);
  idb.close();
  return out;
});

async function addItem(page, name, price) {
  await page.getByRole("button", { name: "Add Item" }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Price").fill(price);
  await sheet.getByRole("radio", { name: /^Veg/ }).click();
  await sheet.getByRole("button", { name: "Add Item" }).click();
  await page.waitForTimeout(300);
  await sheet.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(300);
}

// --- The live build: tables set up and a dish added through its own screens.
let server = await serve(LIVE);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "t2c-upgrade-")), {
  channel: "chrome",
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  // A cached service worker would hand the new tab the live build again.
  serviceWorkers: "block",
});
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
};
const live = await ctx.newPage();
watch(live, "live");
await live.goto(`${BASE}/tables`);
await live.getByRole("button", { name: /Set Up 6 Tables/ }).click();
await live.waitForTimeout(300);
// A price list and a category, shaped as the live build stores them, with their outbox entries.
await live.evaluate(async () => {
  const idb = await new Promise((res, rej) => { const o = indexedDB.open("tap2chef"); o.onsuccess = () => res(o.result); o.onerror = rej; });
  const tx = idb.transaction(["meta", "menuProfiles", "categories", "outbox"], "readwrite");
  const account = await new Promise((res) => { const r = tx.objectStore("meta").get("accountId"); r.onsuccess = () => res(r.result.value); });
  const row = { accountId: account, createdAt: 1, updatedAt: 1, deleted: false };
  tx.objectStore("menuProfiles").put({ ...row, id: "dine", name: "Dine-In", sortKey: "1" });
  tx.objectStore("categories").put({ ...row, id: "starters", name: "Starters", sortKey: "1" });
  tx.objectStore("outbox").add({ table: "menuProfiles", recordId: "dine", queuedAt: 1 });
  tx.objectStore("outbox").add({ table: "categories", recordId: "starters", queuedAt: 1 });
  await new Promise((res) => (tx.oncomplete = res));
  idb.close();
});
await live.goto(`${BASE}/menu`);
await addItem(live, "Samosa", "20");
check(await live.getByText("Samosa").isVisible(), "live build: Samosa added");
const before = await dump(live);
check(before.version === 70, `live build stores version 7 (${before.version / 10})`);

// --- This build, on the same origin, with the live tab still open.
await stop(server);
server = await serve(NEW);
const next = await ctx.newPage();
watch(next, "new");
await next.goto(`${BASE}/menu`);
await next.getByRole("heading", { name: "Menu", level: 1 }).waitFor();
await next.waitForTimeout(500);
check(await next.getByText("Samosa").isVisible(), "new build: the live build's dish still shows");
const after = await dump(next);
const accountId = after.meta.find((m) => m.key === "accountId").value;
check(after.version === 100, `upgraded to version 10 (${after.version / 10})`);
check(Array.isArray(after.repayments) && after.repayments.length === 0, "the repayments table exists, empty");
check(after.meta.find((m) => m.key === "setup")?.value === JSON.stringify({ step: "done" }), "a phone with records is never set up");
check(after.meta.find((m) => m.key === "brandId")?.value === accountId, "the device's brand is the account's first brand");
for (const table of ["menuProfiles", "categories", "items"]) {
  check(after[table].length > 0 && after[table].every((r) => r.brandId === accountId), `every ${table} row is in the brand`);
}
check(after.diningTables.length === 6 && after.diningTables.every((r) => !("brandId" in r) && r.shopId), "shop records stay the shop's, without a brand");
check(after.outbox.length === before.outbox.length, `the upgrade queued nothing to send (${before.outbox.length} → ${after.outbox.length})`);
await next.screenshot({ path: `${S}upgrade-new-menu.png` });
await next.goto(`${BASE}/tables`);
await next.getByText("Keep a copy of your restaurant safe").waitFor();
check(true, "the floor offers to keep a copy safe, once");
await next.screenshot({ path: `${S}upgrade-new-card.png` });

// --- The live tab, left open, keeps working; this build sees what it writes.
await addItem(live, "Chai", "15");
check(await live.getByText("Chai").isVisible(), "live tab left open: still adds a dish");
await next.goto(`${BASE}/tables`);
await next.goto(`${BASE}/menu`);
await next.waitForTimeout(500);
check(await next.getByText("Chai").isVisible(), "new build: shows the dish the old tab added");
const chai = (await dump(next)).items.find((r) => r.name === "Chai");
console.log("     old tab's dish, as stored:", JSON.stringify({ accountId: chai.accountId === accountId, brandId: chai.brandId ?? null }));
await next.screenshot({ path: `${S}upgrade-new-menu-after-old-tab.png` });

await ctx.close();
await stop(server);
check(errors.length === 0, `no console errors${errors.length ? `:\n  ${errors.join("\n  ")}` : ""}`);
console.log(fail.length ? `\n${fail.length} FAILED` : "\nall ok");
process.exit(fail.length ? 1 : 0);
