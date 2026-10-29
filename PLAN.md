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
- [x] 8c Owner sign-in by email code: the "Saved on this device" pill opens "Keep a Copy Safe" → email → 6-digit code (signs in on the sixth digit) → the restaurant's name, only for a new owner → a completion moment. Server: codes hashed, 10 min, 5 tries counted atomically, used once, 30 s before another, rate limits in production; Resend in production, the console elsewhere; `npm run dev:memory` runs the API without MongoDB. Browser-checked at 360 / 820 / 1440, light and dark, offline, and a second phone joining. **Not to go live before 8d**: the sheet says the work is kept in the account, which is true only once sync runs
- [ ] 8d Client sync engine: push outbox, pull since N, apply without re-queuing; poll ~3 s while visible. Push stamps the device's scope on any record without `accountId` (a tab still running the pre-8a build keeps writing `tenantId` records until it reloads)
- [ ] 8e Add a device (QR / 6-digit code from the owner's phone); members with PINs; "by Ravi" on cancels and payments; screens gated by `can()`
- [ ] API deployed behind nginx at `tap2chef.devamhatre.com/api`
- [ ] Later: shop overrides table and a second-shop screen; subscriptions and billing

Said no to: an account before first use, passwords, staff emails or logins, a web dashboard to add devices, permission matrices (three presets, as data), a second-shop screen before a second shop exists.

### 9. Printing / KOT
- [ ] Web Bluetooth (Android) / print dialog / WhatsApp share, behind one port

---

## Decisions

Newest change first within each group. Format: decision — reason (date).

### Product and SaaS
- SaaS from day one: account → shops → members; tenancy in the data model now, billing later — it is a subscription product (2026-10-29).
- The niche is small restaurants (one owner, a few staff, two or three outlets at most), not chains; market products are inspiration, never imitation — Toast-style menu versioning rejected as chain-scale (2026-10-29).
- Menu is account-level; a shop stores only sparse overrides, one level of inheritance — Square/Toast/Petpooja converge here; small owners need no more (2026-10-29).
- Code checks permissions, never role names; owner / manager / staff are preset bundles (data) — custom roles later need no code change (2026-10-29).
- Owner signs a device in once; staff switch on shared devices with a 4-digit PIN — restaurants share tablets (2026-10-29).
- A lapsed or unreachable subscription never blocks taking an order mid-service (2026-10-29).
- No account until it pays off: the app works unsigned, and signing in is offered at "Add a device" or "Keep a copy safe"; the device's own records come along — no setup before value, nothing running breaks (2026-10-29).
- Account and shop ids are made on the device at first use, and the server adopts them at sign-up, so no record is ever re-tagged; the old `local-…` tenant became the account id (2026-10-29).
- Signing in lives behind the "Saved on this device" pill, the one place that already talks about where the work is kept — no Settings screen to add (2026-10-29).
- The code signs in by itself on its sixth digit, with no button; a wrong code clears the field. Offline or a server fault is said quietly beside the field, never in red on it: red means the typed text is wrong (2026-10-29).
- A new owner is asked only the restaurant's name, after the code; the owner's own name waits for staff (8e). Signing in to an existing account on a device with records brings them into it (duplicates in the menu are a warning, never a rule) (2026-10-29).
- Owner sign-in is email OTP, no password; phone SMS waits for a real owner to ask — Indian SMS needs DLT registration and costs per message (2026-10-29).
- A device joins a shop by a QR / 6-digit code shown on the owner's phone (online once), like WhatsApp Web — no dashboard, no staff email (2026-10-29).
- A PIN identifies the person (name and attribution, not security), so it is refused when a colleague would guess it first: all one digit or a straight run (1111, 1234, 9876) (2026-10-29).
- Presets: staff run the service (orders, payments, cancel a sent dish, out today, note an expense; every slip stays visible); a manager also discounts, corrects or removes payments and expenses, sees the day and edits menu and tables; only the owner manages people, devices, shops and the plan. A member who left keeps their name on old records and can do nothing (2026-10-29).
- The server stores a synced record as the device sent it (one collection, keyed by account, table and id) and checks only whose it is and who may write that table; the rules for orders and payments live on the device. Server schemas per table would repeat the domain and change every month (2026-10-29).
- Pushes for one account run one at a time and take a block of sync numbers, written in order: otherwise a quick push could overtake a slow one, and a device pulling in between would move its cursor past records not yet written (2026-10-29).
- The server checks permissions against the member who signed the device in; who is holding it (the PIN) is checked on the device, as Square and Toast do. The account's menu can be written only by someone who works in all shops; a record never moves to another shop (2026-10-29).
- The API runs on the owner's VPS behind nginx at `/api`, same origin as the PWA — no CORS, one certificate (2026-10-29).
- Sync: last write wins in the **server's arrival order**, never device clocks; pull by sync number — cheap phones often have wrong clocks (2026-10-29).
- A device holds only what its signed-in member may see; the server decides (2026-10-29).

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
- Until sync exists, the header says only "Saved on this device" — a growing "unsynced" count and an "Offline" warning read as faults (2026-10-29).
- Focus rings are neutral so red only ever means an error (2026-10-29).

---

## Open questions

**For the restaurant owner**
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
- `useDeviceStorage` is unused since Today became the day's numbers; delete it or put it behind a Settings screen. `useSyncStatus` / `useDeviceStorage` import `dexie-react-hooks` in the use-case layer — move behind subscribe-style ports.
- Two devices opening the same table offline make two orders; the earliest is shown, the other is hidden until a merge exists (needs sync first).
- Send has no kitchen output yet: no KOT print or kitchen screen until step 9 / sync.
- Reads don't filter by shop yet: fine while a device holds one shop; needed (or one local database per shop) before an owner's device syncs two shops.
- The server can't import the client's TypeScript: permissions and synced tables exist twice, kept equal by `server/tests/contract.test.js` until a shared package exists.
- Signing in to an account with several shops picks the first one the owner works in; a shop picker comes with a second shop.
- A write landing in the instant a sign-in re-tags the device could keep the old ids; 8d's push stamps the device's scope where it is missing or unknown.
- Going live with 8c/8d needs on the VPS: `NODE_ENV=production`, `RESEND_API_KEY`, `MAIL_FROM` (devamhatre.com verified in Resend), and nginx proxying `/api`.
- The push lock lives in one Node process; a second server instance would need a lock in the database.
- Fine-grained permissions (removing a payment, a discount) are checked only on the device; the server checks per table.
- The POS project's password login (`User`, `/api/auth/login`) is still in the server until 8c replaces it with email OTP.
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
