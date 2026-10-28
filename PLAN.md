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

### 5. Table grid and orders — **next**
To be broken into features at the step-5 brainstorm. Already decided (see
*Decisions*): channel picks the price list, line snapshot timing, availability
record. Known pieces:
- [ ] Order read model over `menuFor(...)` (a `useMenu`-style use case)
- [ ] Table grid; dine-in and takeaway orders
- [ ] Fire → cooking → served
- [ ] "Out today" availability toggle on the order screen

### 6. Bill settlement
- [ ] Cash / UPI split; settles only when payments sum exactly to the total

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

### Orders (decided ahead of step 5)
- An order picks its price list from its channel (dine-in → Dine-In, takeaway → Takeaway, owner-named lists like Bulk) (2026-10-29).
- An order line snapshots the display name and resolved price when it is **added to the draft**, not at fire or settle — a price change mid-meal never changes the cart (2026-10-29).
- "Out of stock" is its own record `{ itemId, businessDate }`, never a field on the item — last-write-wins would clobber price edits; it resets daily by date key with no reset job; business date has a cutoff (default 4 am); the toggle lives on the order screen (2026-10-29).

### Design
- Sheet actions: a **filled** pill commits (Save, Add), a **tinted** pill closes (Done), plain text leaves (Cancel) — never two filled buttons competing (2026-10-29).
- Forgiveness over confirmation: destructive actions act at once with Undo (2026-10-29).
- Calm confirmation (a tick, a haptic, a line where the eye already is), no confetti — 80 dishes of confetti is noise; save celebration for real milestones (2026-10-29).
- Until sync exists, the header says only "Saved on this device" — a growing "unsynced" count and an "Offline" warning read as faults (2026-10-29).
- Focus rings are neutral so red only ever means an error (2026-10-29).

---

## Open questions

**For the restaurant owner**
- Do you sell anything as half / full (or small / large)? → decides the `portions` pricing arm.
- When a dish runs out mid-service, how do you tell the staff today? → shapes the availability toggle.

**To verify**
- Real iPhone: do sheets rise above the keyboard? (Android behaves; iOS untested.)
- Owner test: 10 real dishes, unaided — where do they hesitate?

**Known gaps**
- `useSyncStatus` / `useDeviceStorage` import `dexie-react-hooks` in the use-case layer — move behind subscribe-style ports.
- The shell defaults to Node 20; the project needs Node 22 (`nvm use`), or the jsdom tests fail to start.

---

## Log

- **2026-10-29** — Steps 1–3 scaffolded. Step 4 menu builder brainstormed (prototype studied, SaaS research), built in four layers, verified in Chrome at four sizes, phone-tested once and polished. North Star, Product Test and this plan established.
