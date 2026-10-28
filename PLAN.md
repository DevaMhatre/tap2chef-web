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
  `git log --oneline -10`.
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

### 6. Bill settlement — **next** (a table frees only when its bill settles)
Brainstormed 2026-10-29 against Toast, Square and Petpooja. The discount is in; 6d waits for the owner test.
- [x] 6a Domain: `settled` arm on the order state (payments + optional adjustment), exact-sum rule, payment-method correction — `cf54125`
- [x] 6b Bill sheet: primary button is Send while anything is unsent, then Settle; one-tap Cash / UPI for the full amount; Split = type cash, UPI fills the rest (sum is exact by construction); cash change chips (₹900 · ₹1000 · ₹2000 → "Change ₹110"); adjust by typing the final amount ("make it ₹850"), recorded as a discount with optional reason, only downward — `6c6422f`, `0b344ad`, `abfa74c`
- [ ] 6c Orders tab: "Settled today" with the day's total; a settled bill never reopens (undo within 5 s only), but its payment method can be corrected
- [ ] 6d UPI QR with the exact amount, drawn on the device from the owner's UPI ID, offline, no gateway; staff tap "Received". **After the owner test.**

Said no to: split by seat / by item / evenly (several payments per bill covers it), promotions engine, reopening a settled bill.

### 7. Expenses and the day's dashboard
- [ ] Daily expenses (cash / UPI)
- [ ] The day's numbers

### 8. Accounts, shops, members, login; sync
- [ ] Account → shops → members; permission presets (owner / manager / staff); staff PIN switching
- [ ] Real login (owner email / OTP)
- [ ] Sync: server-ordered last-write-wins, pull "changes since N"
- [ ] Rename `tenantId` → `accountId` / `shopId`; shop overrides table
- [ ] Subscriptions and billing (after the above)

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
- A discount is typed as the final amount ("make it ₹850"), only downward, reason optional; no percentages, coupons or promotions engine. It covers rounding off and a regular's discount (2026-10-29).
- The on-device UPI QR (6d) waits for the owner test. If they already have a payment speaker and a printed QR, it adds little (2026-10-29).

- A settled bill keeps its `subtotal` snapshot; the day's numbers read payments, never re-add lines (2026-10-29).
- Settle refuses while a dish is unsent; staff Send or remove it first, never an automatic choice (2026-10-29).
- A payment correction changes the method, never the amount, and stamps `correctedAt` so a cash bill turned UPI stays visible to the owner (2026-10-29).
- The bill sheet's commits are two equal tiles, Cash and UPI, each one tap; split and discount are plain links that open in place. "Round off or discount", never "Change amount": "change" already means the cash handed back (2026-10-29).
- A settle is checked against the stored dishes, not the screen's: if another tab changed the bill, it refuses and says so rather than charging for what staff didn't see (2026-10-29).
- Undoing a settle does nothing once the table has a new order or the payment was corrected (2026-10-29).
- A paid takeaway's link shows "Token N is paid"; a dish tapped onto a table settled elsewhere starts the table's next order (2026-10-29).
- Change chips: next ₹50 (bills under ₹1000), ₹100, ₹500, ₹1000, ₹2000 above the amount due, first three (2026-10-29).

### Design
- Sheet actions: a **filled** pill commits (Save, Add), a **tinted** pill closes (Done), plain text leaves (Cancel) — never two filled buttons competing (2026-10-29).
- Forgiveness over confirmation: destructive actions act at once with Undo (2026-10-29).
- Calm confirmation (a tick, a haptic, a line where the eye already is), no confetti — 80 dishes of confetti is noise; save celebration for real milestones (2026-10-29).
- Until sync exists, the header says only "Saved on this device" — a growing "unsynced" count and an "Offline" warning read as faults (2026-10-29).
- Focus rings are neutral so red only ever means an error (2026-10-29).

---

## Open questions

**For the restaurant owner**
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
- `useSyncStatus` / `useDeviceStorage` import `dexie-react-hooks` in the use-case layer — move behind subscribe-style ports.
- Two devices opening the same table offline make two orders; the earliest is shown, the other is hidden until a merge exists (needs sync first).
- Send has no kitchen output yet: no KOT print or kitchen screen until step 9 / sync.
- The shell defaults to Node 20; the project needs Node 22 (`nvm use`), or the jsdom tests fail to start.

---

## Log

- **2026-10-29** — Steps 1–3 scaffolded. Step 4 menu builder brainstormed (prototype studied, SaaS research), built in four layers, verified in Chrome at four sizes, phone-tested once and polished. North Star, Product Test and this plan established.
- **2026-10-29** — Step 5 brainstormed against Toast / Square / Petpooja / Lightspeed, built in four layers (5a–5e), checked in Chrome at 360 / 820 / 1180 / 1440 in light and dark, and offline. Fixed on the way: one sheet handing over to another closed both.
- **2026-10-29** — Step 5 committed on branch `step-5-orders` (5 commits, each typechecks and passes tests). Step 6 brainstormed; proposal and two open choices recorded above.
- **2026-10-29** — 6a committed (`cf54125`). 6b built in four layers, checked in Chrome at 360 / 820 / 1440 in light and dark and offline; double-tap settles once, undo reopens.
