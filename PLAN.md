# Tap2Chef — Plan

The single source of truth for **what** we are building, **what is done**, **what
we decided** and **what is still open**. `CLAUDE.md` says *how* we build; git
history says *why* each change was made. Nothing here is repeated there.

---

## North Star

Tap2Chef is the state-of-the-art product for small restaurants, built the way
Steve Jobs built products at Apple: ruthless focus, simplicity that comes from
deep understanding, care for the parts nobody sees, and the whole product
working as one. Every feature solves a real problem of a small restaurant, and
every screen is something we would demo on a stage, unrehearsed, with pride.

That is the bar, never the brand: no Apple or Steve Jobs name, logo or likeness
in the product or its marketing (see `CLAUDE.md` → Design North Star).

### Definition of done

A feature is marked `[x]` only when **all** of these hold:

1. Typecheck, lint, tests and build pass.
2. Checked in a real browser at phone (360px), tablet and desktop, in light
   and dark.
3. The **Steve Jobs Product Test** (`CLAUDE.md`, questions 0–8) was run with
   evidence and reported — including what failed and what was cut.
4. Committed; the commit hash goes next to the checkbox.

"Works" is not done. "Would Steve ship it?" is done.

---

## How to use this file

- **Start of every session:** read `CLAUDE.md`, then this file, then
  `LEARNINGS.md`, then `git log --oneline -10`.
- **Something went wrong** (a rework, a late bug, a correction): add the
  lesson to `LEARNINGS.md`.
- **A feature passes the definition of done:** tick it and add the commit hash.
- **A decision is made or changed:** edit its line in *Decisions* (don't add a
  second one); keep the date of the latest change and the one-line reason.
- **A question comes up that only the owner or the restaurant can answer:**
  add it to *Open questions*; remove it once answered and record the answer as
  a decision.
- **End of a session:** add one line to *Log*.

---

## Roadmap

### 1–3. Foundations ✓
- [x] Repo, client (React + Vite + TS), server (Express + MongoDB) — `b66afe8`
- [x] Installable PWA that opens offline — `b66afe8`
- [x] Local database (Dexie) + outbox, layered structure — `b66afe8`

### 4. Menu builder ✓ (pending real-device checks)
- [x] Domain contract: one menu, prices per price list, fractional ordering — `09cbb9c`
- [x] Use case (`menuEditor` / `useMenuBuilder`) + Dexie adapter — `968a8cc`
- [x] Menu screen + first design-system primitives — `4564f9a`
- [x] Calm header badge; unambiguous phone prices — `6116d1c`
- [x] Phone-test polish: top confirmation, keyboard stays up, dark-mode selection, sheet actions — `daab591`
- [ ] Verified on a real iPhone: sheets rise above the keyboard
- [ ] Owner test: the restaurant owner types 10 real dishes unaided

### 5. Table grid and orders ✓ (pending owner test)
- [x] 5a Domain contract: lines as records, per-line status, rounds, voids, business date, tokens, out today — `e60010c`
- [x] 5b Tables: one-question setup, floor grid (free / owes ₹ / waited since last round / unsent dot), edit sheet — `e501b07`, `52c906a`
- [x] 5c Order screen: search (words + initials), category chips, one-tap add, cart, notes, Send; price list per channel — `e501b07`, `52c906a`
- [x] 5d Takeaway with daily tokens; Orders tab with "Still open from yesterday" — `e501b07`, `52c906a`
- [x] 5e Cancel a sent dish (part or all, optional reason, undo); move an order to a free table — `e501b07`, `52c906a`
- [ ] Owner test: the restaurant runs one real lunch on it

### 6. Bill settlement ✓ (6d after the owner test) (a table frees only when its bill settles)
Brainstormed 2026-10-29 against Toast, Square and Petpooja. The discount is in; 6d waits for the owner test.
- [x] 6a Domain: `settled` arm on the order state (payments + optional adjustment), exact-sum rule, payment-method correction — `cf54125`
- [x] 6b Bill sheet (first version, one-tap Cash / UPI) — `6c6422f`, `0b344ad`, `abfa74c`
- [x] 6c Settled today, payment correction (first version) — `681c009`, `de83682`, `d9be4fb`
- [x] 6e **Bill first, then money** (rework of 6b/6c after a real-life walkthrough): Send → **Bill** (table turns amber, "Bill · 4 min", Tables shows "₹… waiting to be paid") → bill sheet: choose Cash or UPI (nothing preselected), amount pre-filled with what's left, one **Settle ₹X** button (or **Received ₹X** for a part) → a completion moment over the floor → Undo. Payments are records; part payments add up; a ₹0 bill has Close bill. Settled today is one summary row → its own screen; each payment's method can be corrected — `73ee9e4`
- [x] 6g Remove a wrong payment after Undo has gone (two devices took the whole bill, or a typo); it stays listed, struck through — `c2c9b67`
- [x] Polish: the desktop order panel shows the discount, what's paid and what's still to pay — `c2c9b67`
- [x] 6f Menu: collapsible categories on the Menu tab (4+ categories start collapsed; jump chips go); the order screen stays fully open — `008e4dc`
- [ ] 6d UPI QR with the exact amount, drawn on the device from the owner's UPI ID, offline, no gateway; staff tap "Received". **After the owner test.**

Said no to: split by seat / by item / evenly (several payments per bill covers it), promotions engine, reopening a settled bill.

### 7. Expenses and the day's numbers ✓ (7a–7c done; pending owner test) — `47befb5`, storage fix `9517de9`
Brainstormed 2026-10-29 (cash from the drawer, a notebook or WhatsApp, the midnight question "did the cash match?"; Toast/Square paid-out and variance, Petpooja expense module). Built in four layers, browser-checked at 360 / 820 / 1440 in light and dark.
- [x] 7a Expenses: record of its own (amount, Cash/UPI, note, business day); two-tap entry sheet with learned note chips; Today / Yesterday; remove (struck through, Undo); list by day
- [x] 7b The day's numbers (Today tab): Sales by drawer, Spent, Left, "Cash for the drawer", "Worth a look" (not paid yet, cancelled, discounts, removed and corrected payments), Sold most; step back through earlier days
- [ ] Owner test: the restaurant notes a real day's expenses and checks the drawer figure against the cash box
- [x] 7c Cash drawer: state what it started with and count it at closing; "Should hold" = start + cash taken − cash spent, then Matches / Short / Over; yesterday's count carries in as today's start; shown even before the first sale

Browser scripts now live in `e2e/`. Replacing a drawer count has Undo.

Said no to: categories, vendors, receipts and photos, recurring expenses, editing an amount (remove and re-add), profit by dish, shifts and drawer sessions, taking cash out for the bank as its own record.

### 8. Accounts, devices, staff, login; sync
Brainstormed 2026-10-29 (real life: the owner's data lives on one phone; the rush-hour pain is the waiter's phone and the counter being two islands, not several shops; staff have no email but remember 4 digits; the midnight question "who cancelled that?"; Square device codes and passcodes, Toast passcodes, Petpooja captain logins, WhatsApp Web device linking). Ordered by the first user's pain; 8a–8d help even with one phone, as a backup.
- [x] 8a Domain + storage: `Account / Shop / Member / Role`, `can()`, owner / manager / staff presets, PIN rule; `tenantId` → `accountId` / `shopId` (Dexie v7), unused `settings` table dropped. Upgrade checked in Chrome: data written by the live build survives, and a tab left open on the old build keeps working — `ac755fa`
- [x] 8b Server: tenancy gate (a query without `accountId` throws), `POST /api/sync/push` and `GET /api/sync/pull?shopId&since`, device tokens, `can()` per table, a client–server contract test; 25 tests including isolation and a push overtaking a slow one — `264f7bd`
- [x] 8c Owner sign-in by email code: the "Saved on this device" pill opens "Keep a Copy Safe" → email → 6-digit code (signs in on the sixth digit) → the restaurant's name, only for a new owner → a completion moment. Server: codes hashed, 10 min, 5 tries counted atomically, used once, 30 s before another, rate limits in production; Resend in production, the console elsewhere; `npm run dev:memory` runs the API without MongoDB. Browser-checked at 360 / 820 / 1440, light and dark, offline, and a second phone joining. **Not to go live before 8d**: the sheet says the work is kept in the account, which is true only once sync runs — `71c2b93`
- [x] 8d Sync: the device pushes its outbox (one change per record, as it is now, 500 at a time), then pulls "changes since N" for its shop; a pulled record with an edit still waiting here keeps ours. A change is sent ~300 ms after it is made; a pull every 3 s while signed in, online and on screen. Shop records go under the device's shop (old-build and mid-sign-in rows included); one record the server refuses is set aside, never blocking the rest; a device the server no longer knows goes back to working on its own, losing nothing. The pill says "Saved online" or "Saved on this device". Two devices in Chrome: the waiter's Send reached the counter in 2.3 s, the counter's Bill reached the floor in 1.3 s, an expense noted offline arrived 2.3 s after reconnecting — `b22c829`
- [ ] ~~8e~~ Folded into step 10 (10f–10h), redesigned with the owner's experience first
- [x] API deployed behind nginx at `tap2chef.devamhatre.com/api`: `deploy/vps/setup-api.sh` run on the VPS, pm2 on 127.0.0.1:8100, Atlas `tap2chef` database, Resend verified for devamhatre.com. Checked from outside: health ok, sync refuses without a token, port 8100 unreachable. Founder signed in on a real phone (code arrived by email) and synced two devices — `93fc505`
- [ ] Later: shop overrides table and a second-shop screen; subscriptions and billing

Said no to: an account before first use, passwords, staff emails or logins, a web dashboard to add devices, permission matrices (three presets, as data), a second-shop screen before a second shop exists.

### 10. Setting up a restaurant, and who's who
Decided 2026-10-30 with the founder, and cross-checked against the Steve Jobs Product Test before writing. The working core (orders, bills, expenses, sync) stays as it is; this step is the shape around it: what a new owner goes through, what the owner has that nobody else does, and how a restaurant grows into two or a café. Built one small step at a time; the first owner's feedback can reorder 10f–10i.

**The setup: 4–5 screens, each one changes what they see today**
1. Sign in: email → code.
2. "What's your restaurant called?" → the header and the bill.
3. "How do customers order?" Dine-in · Takeaway · Delivery → the app shapes itself (no dine-in, no tables anywhere).
4. "How many tables?" (dine-in only) → the floor.
5. "What do you sell?" Biryani & meals · Café · Fast food · Sweets & snacks · Cloud kitchen → tap the dishes you sell from a starter list, type each price, add your own. The menu exists before the first order.
→ "You're ready" → the service screen (Tables, or Takeaway).

**Who's who**

| | Owner | Manager | Staff |
|---|---|---|---|
| Orders, bills, payments, cancel with reason, out today | ✓ | ✓ | ✓ |
| Discounts; correct or remove a payment | ✓ | ✓ | – |
| Today, cash drawer, expenses | ✓ all restaurants | ✓ their restaurant | note an expense only |
| Menu and prices | ✓ | their restaurant's prices | – |
| Tables | ✓ | ✓ | – |
| People, phones, details, add a restaurant | ✓ | – | – |

Small steps:
- [x] 10a Brand level in the data: the menu belongs to a brand; shops inherit it; today's account menu becomes the first brand's, with nothing visible changing. Device: Dexie v8 puts every menu row in the account's first brand (its id is the account's), the scope gains `brandId`, menu records travel with it. Server: `Brand` model, shops carry `brandId`, a pull brings the shop's brand's menu, a menu record never moves brand and only goes into one of the account's brands; at every start, before listening, `fileMenusUnderBrands()` gives older accounts their first brand and files their shops and menu records under it. Both old builds are tolerated: a device from before brands sends menus without one (filed under the first brand), a server from before brands names none (the device takes the account's id). Every new guard's test fails without it. Upgrade checked in Chrome against the live build's data and with a live-build tab left open (`e2e/upgrade.mjs`); sync, sign-in, day, menu and bill scripts re-run at 360 / 820 / 1440, light and dark — `d81cf2b`
- [x] 10c The setup above for a new owner, offline never blocking (the account attaches when there's internet); a phone that already has records gets a one-time "Keep a copy of Sharma Dhaba safe" card instead. Domain `setup` (how customers order, the steps, reading the starter list) and `starterMenus` (five lists, names and diets, no prices); `useSetup` over two new ports (`ShopRepository`: name and how customers order, synced, one record per shop; `SetupStore`: progress, on this phone only); `addDishes` on the menu editor; Dexie v9 `shopDetails`; the header shows the restaurant's name; `e2e/setup.mjs` (60 checks) and `e2e/skipSetup.mjs` for the other scripts. Browser-checked at 360 / 820 / 1440, light and dark: online new owner, a second phone, a takeaway kitchen offline signing in later through the card, a setup interrupted and resumed, double taps; every older script and the live-build upgrade re-run — `b7f282f`
- [x] 10d The app shapes itself to how customers order: no dine-in → no Tables tab, the takeaway screen is home. Domain `showsTables`; the shop's details read once above the app (`ShopProvider`), and the app waits for them so the tabs never change under the eye; four tabs, Orders as home, `/`, `/tables` and unknown links open Orders, the empty Orders says "Start a takeaway." Checked in `e2e/setup.mjs` at 360 and 1440; every other script re-run — `ef0443a`
- [ ] 10e The restaurant's name in the header is the owner's door: details, people, phones, add a restaurant; staff tapping it see only who is using this phone. **Details done — `8f72f3a`;** people, phones and add a restaurant still to come. The name (header, and sidebar on wider screens) carries a chevron and opens "Restaurant": the name and how customers order, the setup's own tiles, Save only once something changed; the app reshapes at once. Dine-in only makes "+ Takeaway" tinted and the empty Orders says "Tap a table to start an order." `useRestaurantDetails`, `ServiceTiles` shared with the setup. People, phones and add a restaurant join the sheet with 10f, 10g and 10i; what staff see waits for 10g. Checked in `e2e/setup.mjs` at 360 and 1440, light and dark; every other script re-run
- [x] 10f Add a phone: a QR and a 6-digit code on the owner's phone, the waiter's phone joins ("Join Sharma Dhaba?"); the list of phones with Remove. Server: `Device` records (owner / linked, label, last seen, removed), `LinkCode` (hashed, one per shop, 10 min, used once), `/api/devices` (code, list, remove, join), tokens name their device, an old token gets its record and a renewed token on its next sync, a removed phone is refused with "removed"; only the owner's own phone manages phones or pushes the restaurant's details. Phone: "Add a Phone" (QR drawn from tokens, the code, a fresh one on expiry, "Android phone joined"), the phones list with Remove (asked once), `/join#code` and "Joining a restaurant?" on a new phone, a linked phone's sheet read-only, a removed phone clears itself to a new one. `e2e/phones.mjs`: joined in 0.8 s, a removed phone cleared in 1.8 s — `f626879`
- [ ] 10g People: "Can they handle money and the menu when you're away?" (yes → manager, no → staff); a PIN to pick yourself on a shared phone; "by Ravi" on cancels and payments
- [ ] 10h Screens and actions follow the table above, through `can()`; presets adjusted (a manager edits their restaurant's prices, not the brand's menu)
- [ ] 10b Reads scoped per shop and one sync cursor per shop, so a phone that holds two restaurants never mixes them or skips one's records. Moved here 2026-10-30: it only matters once a phone holds two restaurants; it must also count a menu row with no `brandId` (written by a pre-brand tab) as the first brand's
- [ ] 10i Add a restaurant: "Same menu as Sharma Biryani?" → a branch or a new menu; the area is asked here; the header name switches restaurants; the owner's Today shows every restaurant, one row each

Said no to (for now, not forever): asking how customers pay (Cash and UPI on by default; the UPI ID comes with the UPI QR), asking the location at setup, role names when adding a person, an owner's home on the day's numbers, a sixth tab, one-tap Google sign-in, "Snap your menu", billing and subscriptions — each waits for the first owner's feedback or for a second restaurant.

### 9. Printing / KOT
- [ ] Web Bluetooth (Android) / print dialog / WhatsApp share, behind one port

---

## Decisions

Newest change first within each group. Format: decision — reason (date).

### Product and SaaS
- SaaS from day one: account → shops → members; tenancy in the data model now, billing later — it is a subscription product (2026-10-29).
- The niche is small restaurants (one owner, a few staff, two or three outlets at most), not chains; market products are inspiration, never imitation — Toast-style menu versioning rejected as chain-scale (2026-10-29).
- The owner only ever sees "restaurants"; underneath, account → brand → shop. Adding one asks "Same menu as Sharma Biryani?": yes is a branch (a shop of that brand), no is a new brand. The biryani cook opening a café thinks "my second restaurant", never "a new brand" (2026-10-30).
- Menu is brand-level; a shop stores only sparse overrides, one level of inheritance — so a second biryani branch gets the menu on day one and a café's menu never mixes with it. Square shares one item list across every location; Petpooja keeps one per outlet (2026-10-30).
- Code checks permissions, never role names; owner / manager / staff are preset bundles (data) — custom roles later need no code change (2026-10-29).
- Owner signs a device in once; staff switch on shared devices with a 4-digit PIN — restaurants share tablets (2026-10-29).
- A lapsed or unreachable subscription never blocks taking an order mid-service (2026-10-29).
- Account first, never a wall: a new restaurant signs in during setup, so it is backed up and ready for a second phone from minute one; offline on first open, setup carries on and the account attaches later. A phone that already has records gets a one-time card instead of the setup. Replaces "no account until it pays off": a hidden door meant most owners would never back up (2026-10-30).
- Setup asks only what changes the app today, never something only we want to know: name, how customers order, tables (dine-in only), what they sell. Payment methods (Cash and UPI by default) and the location are asked when they matter (2026-10-30).
- "How do customers order?" shapes the app: a takeaway-only cloud kitchen never sees tables. Every other POS gives every restaurant the same screens (2026-10-30).
- "What do you sell?" leads to a starter list of dishes to tap and price, so the menu exists before the first order; the empty menu is where owners give up (2026-10-30).
- Everyone opens to the service screen; the owner has more tabs, not another home. The owner is usually the cashier at 8 pm (2026-10-30).
- The owner's own things (people, phones, details, add a restaurant, switch restaurant) live behind the restaurant's name in the header, not a sixth tab (2026-10-30).
- Adding a person asks "Can they handle money and the menu when you're away?" instead of role names; yes is manager, no is staff (2026-10-30).
- Account and shop ids are made on the device at first use, and the server adopts them at sign-up, so no record is ever re-tagged; the old `local-…` tenant became the account id (2026-10-29).
- Signing in lives behind the "Saved on this device" pill, the one place that already talks about where the work is kept — no Settings screen to add (2026-10-29).
- The code signs in by itself on its sixth digit, with no button; a wrong code clears the field. Offline or a server fault is said quietly beside the field, never in red on it: red means the typed text is wrong (2026-10-29).
- A new owner is asked only the restaurant's name, after the code; the owner's own name waits for staff (8e). Signing in to an existing account on a device with records brings them into it (duplicates in the menu are a warning, never a rule) (2026-10-29).
- Owner sign-in is email OTP, no password; phone SMS waits for a real owner to ask — Indian SMS needs DLT registration and costs per message (2026-10-29).
- A device joins a shop by a QR / 6-digit code shown on the owner's phone (online once), like WhatsApp Web — no dashboard, no staff email (2026-10-29).
- A PIN identifies the person (name and attribution, not security), so it is refused when a colleague would guess it first: all one digit or a straight run (1111, 1234, 9876) (2026-10-29).
- Presets: staff run the service (orders, payments, cancel a sent dish, out today, note an expense; every slip stays visible); a manager also discounts, corrects or removes payments and expenses, sees the day and edits menu and tables; only the owner manages people, devices, shops and the plan. A member who left keeps their name on old records and can do nothing (2026-10-29).
- The server stores a synced record as the device sent it (one collection, keyed by account, table and id) and checks only whose it is and who may write that table; the rules for orders and payments live on the device. Server schemas per table would repeat the domain and change every month (2026-10-29).
- Sync is push, then pull, every 3 s while on screen, plus a push ~300 ms after each change; no server push yet — for 2–4 devices polling is enough, and it works through any proxy (2026-10-29).
- A record the server refuses (another shop's, not allowed) is set aside and logged, so it never blocks the outbox; the record stays on the device. A 401 signs the device out and keeps everything on it (2026-10-29).
- Pushes for one account run one at a time and take a block of sync numbers, written in order: otherwise a quick push could overtake a slow one, and a device pulling in between would move its cursor past records not yet written (2026-10-29).
- The server checks permissions against the member who signed the device in; who is holding it (the PIN) is checked on the device, as Square and Toast do. The account's menu can be written only by someone who works in all shops; a record never moves to another shop (2026-10-29).
- The API runs on the owner's VPS behind nginx at `/api`, same origin as the PWA — no CORS, one certificate (2026-10-29).
- The API reaches the VPS like the site: CI publishes `server/` as the `api` branch once every check passes; `/root/tap2chef-api-update.sh` (its own `/etc/cron.d` entry, every 5 min) installs it, runs it under pm2 (as the POS already is) on 127.0.0.1:8100, and puts the previous version back if the new one fails its health check. No keys anywhere; secrets live only in `/etc/tap2chef-api.env` (600) on the server (2026-10-30).
- The database is MongoDB Atlas (the owner's existing cluster, its own `tap2chef` database): the restaurant's copy survives even if the VPS dies, and Ubuntu 25.04 isn't a MongoDB-supported platform (2026-10-30).
- Sync: last write wins in the **server's arrival order**, never device clocks; pull by sync number — cheap phones often have wrong clocks (2026-10-29).
- A device holds only what its signed-in member may see; the server decides (2026-10-29).
- An account's first brand takes the account's id, on the device and on the server. Every device of an account upgrading on its own, offline, then names the same brand without asking anyone, and nothing is re-tagged; later brands get fresh ids. A random id per device would split one restaurant's menu into as many brands as it has phones (2026-10-30).
- Setup, as built: one question per screen, no step counter. A phone that already has records, or a session, never sees it; decided on first look and stored, so the setup's own writes can't flip it. Progress stays on the phone (a second phone signs in and has nothing to set up); the name and how customers order are a synced record per shop, id = shop id, so two phones answering write one record. The account step's way past is plain "Set up now, sign in later" when the code doesn't come; offline, "Set Up Now" is the one filled button and the email waits for the internet. The name typed during an offline setup goes with the code later, never asked twice (2026-10-30).
- The starter list: typing a price picks a dish (no checkboxes); a starter dish's diet comes with its name; anything baked that usually holds egg is marked egg, since wrongly marked veg is the unforgivable mistake; an owner's own dish needs name, diet and price. One price goes on every price list; a takeaway-only kitchen's one list is "Takeaway". The lists are a first draft for real owners to correct (2026-10-30).
- Adding a phone: a 6-digit code (hashed, one live per shop, 10 min, used once) shown with a QR of `/join#code`, so the camera opens "Join Sharma Dhaba?" directly; asking first never uses the code. Only a phone with nothing on it joins, so a waiter's test dishes never mix into the real menu. The code is found by its hash alone (the joining phone knows no account), so `LinkCode` is outside the tenancy gate, like `LoginCode`. WhatsApp Web links devices the same way; Square uses a dashboard code, Petpooja a captain login (2026-10-30).
- Phones are records (owner's, by email; linked, by code). Only the owner's own phone adds or removes phones, changes the restaurant's details, and later manages people: one rule on the server instead of a permissions screen. A linked phone works with the permissions of the owner who showed the code, until PINs (10g) and `can()` on screens (10h). Phones are named by what they are ("Android phone"); people's names come with 10g (2026-10-30).
- Remove signs a phone out for good and it clears the restaurant from itself (its records, sign-in and setup), starting again as a new phone; anything it hadn't sent is lost, and the confirmation says so. A former waiter keeping the bills is the risk; a signed-out phone (expired token) still keeps everything (2026-10-30).
- Phones signed in before phone records existed get one, and a renewed token, on their next sync: never asked to sign in again (2026-10-30).
- The restaurant sheet holds only what the owner told the setup; a row appears only when its step works (no empty People / Phones / Add a restaurant). No address, GST or phone fields until something uses them; sign-in stays behind the saved pill; no confirmation before Save, as changing it back is one tap. Removing dine-in hides the floor but deletes nothing: an open table order stays reachable from Orders, and the tables return with dine-in. A restaurant from before the setup starts the sheet with its account's name and both ways (2026-10-30).
- At a dine-in-only place "+ Takeaway" stays, tinted: a parcel still happens, but it isn't the screen's main action (2026-10-30).
- A takeaway-only kitchen never meets tables: four tabs, Orders as home (one tap to "+ Takeaway"), any link to the floor opens Orders. "Orders" keeps its name (delivery will live there too). Dine-in only keeps "+ Takeaway": a parcel at a sit-down place is common, and blocking it mid-rush with no way to change the answer (until 10e) costs a sale. No settings toggle: the setup answer is the switch. Toast and Square set a service mode per device in settings (2026-10-30).
- The "keep a copy safe" card shows once, on Tables and Orders, only when online and not signed in: an action that can't work now isn't offered (2026-10-30).
- 10b (per-shop reads and sync cursors) waits until just before 10i: no restaurant needs it until one phone holds two, and unlike 10a it doesn't change the stored data, so waiting costs nothing. The first owner's flow (10c–10h) comes first (2026-10-30).
- The server's data moves forward in code that runs at every start, before the API listens, and changes nothing once done (`server/migrations/`): it reaches the live database through the normal deploy, with the updater's health check and rollback, never by hand on the VPS (2026-10-30).

### Menu
- One menu with a price per **price list** (Dine-In, Takeaway, Bulk… owner-named); a missing price = not sold in that list — takeaway prices differ and some dishes are dine-in only (2026-10-29).
- Quick add takes one price and applies it to every list; a new list starts as a copy of the first list's prices — the owner edits only the exceptions (2026-10-29).
- `Pricing` is a union with one arm (`fixed`); half/full portions become a new arm if needed, no migration (2026-10-29).
- Veg / non-veg / egg is required with no default — defaulting to veg risks mislabelling a chicken dish (2026-10-29).
- Strict rupee parsing (`12.505`, `12abc` rejected, never rounded); ₹0 is legal; ₹1,00,000 per-item cap catches an extra zero (2026-10-29).
- Duplicate names are a warning, never a rule — two offline devices can always create the same name (2026-10-29).
- Fractional sort keys: a move is one write; ties (offline appends) break by id and are repaired by re-keying (2026-10-29).
- Deleting a category takes its dishes with it, with undo; the last price list can't be removed (2026-10-29).
- Categories fold on the Menu tab: each is a card row ("Mains · 12"), Edit shows only while open, 4 or more start folded, and a category that gains a dish opens itself; the jump chips go. The order screen never folds — speed beats overview there (2026-10-29).
- Drag-to-reorder deferred: dishes appear in typing order, which follows the printed menu (2026-10-29).

### Orders
Market study (Toast, Square, Petpooja, Lightspeed) before each call; each one removes an option rather than adding a setting.
- Order lines are records of their own, not an array on the order — two devices adding to one table merge under last-write-wins instead of overwriting (2026-10-29).
- Status lives on the line (draft → sent → voided); the order is open → settled; "served" dropped — tables order in rounds, and small kitchens track serving by voice (2026-10-29).
- One **Send** button, no Hold/Stay, no course setup: unsent dishes are the hold, each Send is a round — Toast needs three buttons and course config for the same thing (2026-10-29).
- Round numbers come from send time, never a stored counter — two offline devices would both send "round 2" (2026-10-29).
- Send returns to the floor (Tables / Orders); the tile showing the new total is the confirmation (2026-10-29).
- A sent dish is cancelled, never deleted: one tap + undo, reason optional, kept for the day's numbers — Petpooja forces reason + approver; honesty by visibility, not friction. Approver comes with staff PINs (2026-10-29).
- Cancelling with reason "Out of stock" also marks the dish out today — the two are one problem (2026-10-29).
- An order is stored with its first dish, not when the table is tapped; an order with no live line frees its table — no ghost tables (2026-10-29).
- Tables: setup is "How many tables?", numbered 1…n; no floor plan, areas or merging — the owner knows where table 4 is (2026-10-29).
- The floor shows time since the **last round was sent**, not since seating, with no thresholds to configure (2026-10-29).
- Takeaway is an order with a daily token (max + 1, never reused), no New/Accepted/Done stages; token taken when the order is stored (2026-10-29).
- Price list: an order starts on the list named for its channel ("Takeaway", "Parcel"), else the first; it can switch only before its first dish; no channel setting, and a one-off Bulk order never becomes the default (2026-10-29).
- A line snapshots name and price when it is **added to the draft**, not at send or settle — a price change mid-meal never changes the cart (2026-10-29).
- "Out of stock" is its own record `{ itemId, businessDate }` with id `itemId@date`, never a field on the item; resets by date, no job; business day starts at 4 am (2026-10-29).
- Open orders from an earlier business day are listed first under "Still open from yesterday" — never silently lost (2026-10-29).
- Phones and tablets in portrait: the order is a bar under the thumb with Send on it; from 1024px the ticket sits beside the menu (2026-10-29).

### Bills
- Bill first, then money: the order goes open → billed → settled. "Bill" hands it over and the table waits to pay (amber); the money comes after, maybe in parts. One more dish takes the table back to open — real counters work this way, and it ends forgotten "printed, unpaid" bills (2026-10-29).
- Payments are records of their own, never a list on the order — two devices taking parts of one bill both count; if both take it all, the bill shows "extra received" instead of losing one (2026-10-29).
- The payment that leaves nothing to pay settles the bill; settling is never a separate step to forget (2026-10-29).
- Cash and UPI only choose (Apple: a segmented control never acts); one filled **Settle ₹X** commits, then a completion moment (check, amount, "Hand back ₹200") for about a second over the floor, then Undo — a conscious step, and the feeling of a job done (2026-10-29).
- A discount is typed as the final amount ("make it ₹850"), only downward, reason optional; no percentages, coupons or promotions engine. It covers rounding off and a regular's discount (2026-10-29).
- The on-device UPI QR (6d) waits for the owner test. If they already have a payment speaker and a printed QR, it adds little (2026-10-29).

- A settled bill keeps its `subtotal` snapshot; the day's numbers read payments, never re-add lines (2026-10-29).
- Bill refuses while a dish is unsent; staff Send or remove it first, never an automatic choice (2026-10-29).
- A correction changes one payment's method, never its amount, and stamps `correctedAt` so cash turned UPI stays visible to the owner (2026-10-29).
- "Round off or discount", never "Change amount": "change" already means the cash handed back. A discount agreed with a part payment stays agreed when the sheet reopens (2026-10-29).
- A payment is checked against the stored dishes and payments, not the screen's: if another tab changed the bill, it refuses and says so rather than charging for what staff didn't see (2026-10-29).
- Undo takes a payment back and reopens the bill it closed — not once the table has a new order (2026-10-29).
- A wrong payment is removed, never deleted: it stays listed, struck through, and stops counting. While the bill is open any payment can go; on a settled bill only an excess can, so it stays exact and never reopens. A "UPI received" that never arrived after the guest left is a loss to see in the day's numbers, not a reopened bill (2026-10-29).
- A paid takeaway's link shows "Token N is paid"; a dish tapped onto a table settled elsewhere starts the table's next order (2026-10-29).
- "Settled today" is one summary row (total, cash, UPI) that opens its own screen — the Orders tab keeps only live work; Apple uses drill-in for history and disclosure only for details (2026-10-29).
- A paid bill counts on its order's business day, like its token; one left open overnight belongs to the evening it was served (2026-10-29).
- A corrected bill says "corrected" in the list and when, in the sheet (2026-10-29).
- No change chips (cashiers count change in their heads): staff type the cash received and the change shows; UPI is exact (2026-10-29).

### Expenses and the day
- An expense is a record of its own `{ amount, method, note, businessDate }`; a note is required ("₹340" alone means nothing at midnight); ₹0 refused. No categories or vendors: notes the owner already typed come back as one-tap chips, nothing to configure (2026-10-29).
- Expenses start on Cash, unlike bill payments which start on nothing: spending is overwhelmingly cash, and a wrong drawer is visible in the list and undoable (2026-10-29).
- An expense can go on today or yesterday (a forgotten gas bill), no older; the amount is never edited, remove and re-add — like a payment (2026-10-29).
- The day's numbers read by the order's business day, so a bill served Tuesday and paid after 4 am Wednesday is Tuesday's; part payments on a bill still open count, as the money is real (2026-10-29).
- The cash drawer is two facts the owner states, each a record of its own with id `opening@day` / `counted@day` (two devices never overwrite each other; stating again replaces): what it started with, and what was counted. "Should hold" = start + cash taken − cash spent, shown only once the start is known; a count then reads Matches, Short or Over. No shifts or drawer sessions — Toast-style, chain-scale (2026-10-29).
- Yesterday's count is today's start unless today's is stated: the cash box carries over, so the owner types it once, at closing. The float can be entered before the first sale, so the cash section shows on an empty day (2026-10-29).
- Left and the drawer figure may be below zero (more spent than taken); they are plain numbers, not `Paise` (2026-10-29).
- "Worth a look" shows only what is not zero: unpaid, cancelled after sending, discounts, payments removed or corrected — honesty by visibility, as with voids (2026-10-29).
- The day's records come from their own read-only port (`DayRepository`), by day, so an earlier day never depends on what the order screen loaded (2026-10-29).

### Hosting
- Tap2Chef is a static PWA served by nginx at `tap2chef.devamhatre.com` on the owner's VPS, with its own Let's Encrypt certificate; a push to `main` that passes CI publishes the `site` branch, and the server installs it within 5 minutes — no build tools or keys on the server, no server keys on the (company) dev laptop (2026-10-29).
- The owner's sites moved from devamhatre.cloud (expires 2026-11-11) to devamhatre.com, each with its own certificate (never one shared with .cloud, whose renewal will fail after expiry); .cloud 301-redirects until then; portfolio, POS and Tap2Chef all live on .com, and Google Search Console has the change of address (2026-10-29).

### Design
- Crowding: history is a summary row you tap into (Wallet, Settings); collapsible sections only where the owner edits (Menu tab), never on the order screen, where every dish must be one tap away (2026-10-29).
- Sheet actions: a **filled** pill commits (Save, Add), a **tinted** pill closes (Done), plain text leaves (Cancel) — never two filled buttons competing (2026-10-29).
- Forgiveness over confirmation: destructive actions act at once with Undo (2026-10-29).
- Calm confirmation (a tick, a haptic, a line where the eye already is), no confetti — 80 dishes of confetti is noise; save celebration for real milestones (2026-10-29).
- The header pill says only where the work is: "Saved on this device" (signed out, offline, or not sent yet) or "Saved online". Never a count of waiting changes or an "Offline" warning: the app works the same either way, and a number that grows while the internet is down reads as a fault (2026-10-29).
- Focus rings are neutral so red only ever means an error (2026-10-29).

---

## Open questions

**For the restaurant owner**
- Delivery: do Swiggy / Zomato orders get entered by hand, printed from the tablet, or kept apart? → decides what the Delivery choice in setup turns on.
- Which starter dishes and prices would a biryani shop and a café expect to see? → the starter lists for "What do you sell?".
- How many phones or tablets would you use at once? Do waiters use their own phones, or one shared device? → decides how much of 8e comes first.
- Who should be able to give a discount or see the day's takings when you are not there? → checks the presets.
- Who takes the money: the counter, or the waiter at the table? Do you print the bill today?
- Do regulars pay later ("likh lo")? How do you keep track? → decides a "pay later" method.
- Do friends split one bill across several UPI payments?
- Do you charge GST on the bill; are you GST-registered? → tax lines and sequential bill numbers (two offline devices could collide on them).
- How do customers pay UPI today: printed QR, payment speaker, or your own phone? → decides 6d.
- How often do you discount or round off a bill, and who decides?
- How does an order reach the kitchen today (shouted, paper KOT, the waiter walks in)? → decides what Send produces before printing (step 9).
- Do you change or cancel something after the kitchen has it? How often, and who decides?
- Do customers move tables, or split one table's bill?
- Takeaway: do you call out a token number, a name, or both?
- Do you sell anything as half / full (or small / large)? → decides the `portions` pricing arm.
- When a dish runs out mid-service, how do you tell the staff today? → shapes the availability toggle.

**To verify**
- Real iPhone: do sheets rise above the keyboard? (Android behaves; iOS untested.)
- Owner test: 10 real dishes, unaided — where do they hesitate?

**Known gaps**
- The VPS exposes the POS API (port 8000) and a Docker container (port 4000) directly to the internet, bypassing nginx and HTTPS — close with a firewall (owner's server, not this repo).
- After 2026-11-11: remove the .cloud server blocks and `certbot delete --cert-name devamhatre.cloud` / `pos.devamhatre.cloud`, or renewals will warn by email.
- A record set aside by the server stays on the device unsent, with only a console warning; nobody sees it. Fine while every device is the owner's; staff devices (8e) need it shown.
- A device pushes shop records under the shop it works in: right while a device holds one shop; a device switching shops needs per-shop reads first (see below).
- Two devices opening the same table offline make two orders; the earliest is shown, the other is hidden until a merge exists. Sync now makes this reachable: a waiter and the counter both starting table 4 while one is offline.
- Two offline devices can give two takeaways the same token number.
- Send has no kitchen output yet: no KOT print or kitchen screen until step 9 / sync.
- `shopDetails` pushed to an API from before 10c is refused as an unknown table and set aside, so a setup done in the minutes between the site and the API updating never reaches the account. Deploy the API first, or accept it for that window.
- Renaming the restaurant changes `shopDetails` (every phone's header) but not the server's account name, which only the sign-in sheet's greeting reads. Fix when the server learns to read `shopDetails`, or with 10i's restaurant list.
- A linked phone has the owner's permissions on the server (orders, payments, discounts, menu) until PINs and `can()` arrive (10g, 10h).
- Deploy the API before the site: a new site against the old API finds no `/api/devices` (adding phones fails quietly) and its `shopDetails` is refused.
- Reads don't filter by shop yet: fine while a device holds one shop; needed (or one local database per shop) before an owner's device syncs two shops.
- A menu row written by a tab still on a build from before brands has no `brandId` on the device (sync stamps it on the way out, and the server files it). 10b's per-brand menu reads (now just before 10i) must count such a row as the account's first brand, or they will hide it.
- The server tolerates menu records sent without a brand (old builds) by filing them under the account's first brand. Once every device has updated, that fallback can go; with a second brand (10i) it would put an old build's dish in the wrong menu.
- The server can't import the client's TypeScript: permissions and synced tables exist twice, kept equal by `server/tests/contract.test.js` until a shared package exists.
- Signing in to an account with several shops picks the first one the owner works in; a shop picker comes with a second shop.
- The site updater runs (the live build matches the `site` branch) but not from root's crontab; where it is scheduled is undocumented. Worth one look before the next server change.
- The push lock lives in one Node process; a second server instance would need a lock in the database.
- Fine-grained permissions (removing a payment, a discount) are checked only on the device; the server checks per table.
- The shell defaults to Node 20; the project needs Node 22 (`nvm use`), or the jsdom tests fail to start.

---

## Log

- **2026-10-29** — Steps 1–3 scaffolded. Step 4 menu builder brainstormed (prototype studied, SaaS research), built in four layers, verified in Chrome at four sizes, phone-tested once and polished. North Star, Product Test and this plan established.
- **2026-10-29** — Step 5 brainstormed against Toast / Square / Petpooja / Lightspeed, built in four layers (5a–5e), checked in Chrome at 360 / 820 / 1180 / 1440 in light and dark, and offline. Fixed on the way: one sheet handing over to another closed both.
- **2026-10-29** — Step 5 committed on branch `step-5-orders` (5 commits, each typechecks and passes tests). Step 6 brainstormed; proposal and two open choices recorded above.
- **2026-10-29** — 6a committed (`cf54125`). 6b built in four layers, checked in Chrome at 360 / 820 / 1440 in light and dark and offline; double-tap settles once, undo reopens.
- **2026-10-29** — 6b committed. 6c built: Settled today with takings by drawer, paid-bill sheet, payment correction; checked at 360 / 820 / 1440 light and dark.
- **2026-10-29** — 6c committed. The user challenged the one-tap settle against real life; walked the counter workflow, studied Toast / Petpooja / Apple HIG, and rebuilt as 6e: bill first, then money; payments as records; deliberate Settle with a completion moment; Settled today as a drill-in. Caught on the way: a discount agreed with a part payment was lost on reopening; the completion moment was cut short when a takeaway's screen changed.
- **2026-10-29** — LEARNINGS.md started. 6g (remove a wrong payment) and 6f (folding Menu categories) built, browser-checked at four sizes, committed. Step 6 complete; 6d waits for the owner test; owner test of steps 5–6 and real-iPhone sheet check still open.
- **2026-10-29** — Step 7 brainstormed, built (domain `expense` / `dayBook`, `expenseBook` + `useExpenses` / `useDayNumbers`, Dexie adapters, Expenses page, Today page) and browser-checked at 360 / 820 / 1440, light and dark. Caught on the way: `writeAll` merged over the stored row, so Undo of a removed payment (6g) never restored it in real storage; now a record replaces the row. Owner test and commit pending.
- **2026-10-29** — 7c built (domain `drawer`, `drawerEntries` table, `DrawerRepository`, Cash drawer section and sheet on Today) and browser-checked at 360 / 820 / 1440, light and dark, including the morning case with no sales. Step 7 complete.
- **2026-10-29** — Step 8 brainstormed (real life, Square / Toast / Petpooja / WhatsApp Web linking); split into 8a–8e; email OTP and the API behind nginx decided. 8a built, upgrade checked in Chrome against the live build (and with an old tab open), committed `ac755fa`.
- **2026-10-29** — 8b built: tenancy gate, sync push / pull, device tokens, per-table permissions, contract test; the race test was made deterministic after it passed without its lock. Committed `264f7bd`.
- **2026-10-29** — 8c built: email-code sign-in behind the saved pill, server codes and accounts, `dev:memory`; caught on the way: the completion moment swapped away by its own sign-in, browser email validation hiding our message, offline shown in red. Committed `71c2b93`; held local until 8d.
- **2026-10-29** — 8d built: push / pull sync with the keep-ours rule, `useSync` timing, the pill says where the work is; two-device browser script (`e2e/sync.mjs`). Caught: a test that passed without its rule; a flaky live-query count. 8a–8d committed, ready to go live together once the VPS has the API. Committed `b22c829`.
- **2026-10-30** — Read the VPS (owner ran read-only commands): no MongoDB, pm2 runs the POS on *:8000, no root crontab. Server now binds to `HOST` (127.0.0.1 on the VPS), trusts nginx in production, stops without its database; CI publishes the `api` branch; `deploy/vps/setup-api.sh` + updater written and dry-run against a copy of the live nginx config (9 scenarios incl. nginx refusing and a failing release). Atlas chosen for the database.
- **2026-10-30** — Step 8a–8d live: API set up on the VPS, sign-in by email code and two-device sync confirmed by the founder on real phones ("like a knife in the butter"). Next: 8e (add a device by code, staff PINs, "by Ravi").
- **2026-10-30** — Designed the owner's experience with the founder (step 10): account → brand → shop with the owner seeing only "restaurants"; a 4–5 screen setup where each answer changes the app; owner / manager / staff; the header name as the owner's door. Cross-checked against the Steve Jobs test (cut: brand/outlet words, the owner's Today home, a sixth tab, payment and location questions, role names). Written into PLAN and CLAUDE.md; nothing built yet.
- **2026-10-30** — 10a built: the menu belongs to a brand on the device (Dexie v8) and on the server (`Brand`, shops in a brand, sync by brand, start-up migration for older accounts); the first brand takes the account's id so devices agree offline. Guard-removal check on every new rule; upgrade checked in Chrome against the live build (`e2e/upgrade.mjs`, new); all browser scripts re-run. Committed `d81cf2b`.
- **2026-10-30** — 10b moved to just before 10i (no restaurant needs it yet). 10c brainstormed (a new owner's first ten minutes; Petpooja / Toast set you up by hand, Square gives a checklist), cut against the Steve test (separate Delivery, "Cloud kitchen", checkboxes, suggested prices, step counter), approved and built. Caught on the way: the v7 upgrade looped over today's table list; the offline account screen offered a filled button that couldn't work. Committed `b7f282f`.
- **2026-10-30** — 10c committed. 10d brainstormed (a takeaway counter is two taps from an order today; Toast / Square hide it in a per-device setting), approved and built: the app shapes itself from the setup answer. Committed `ef0443a`.
- **2026-10-30** — 10d committed. 10e brainstormed (rarely opened, never mid-rush; others bury it in settings), approved and built with what exists today: the name as the door to the setup's answers. Caught on the way: the sheet's Save and form first held two copies of the typing; dine-in only still said "start a takeaway"; the unticked tile circle was nearly invisible on grey. Committed `8f72f3a`.
- **2026-10-30** — 10e (details) committed. 10f brainstormed (the waiter's phone signed in with the owner's email, no way to take it back; WhatsApp Web linking), approved and built: phone records, join by QR or code, the phones list, Remove that clears the phone, the owner-only rule on the server. Caught on the way: closing a sheet mid-request left an aborted fetch unhandled. Committed `f626879`.
