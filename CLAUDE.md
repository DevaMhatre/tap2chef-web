# Tap2Chef — Engineering & Design Guide

Read at the start of every session. These are non-negotiable defaults.

**Then read [`PLAN.md`](PLAN.md)** — the single source of truth for what is
done, what was decided and what is open. Update it whenever a feature passes
the definition of done or a decision is made or changed.

---

## Product

Tap2Chef runs a small restaurant from one device: menu, tables, orders, kitchen
queue, bill settlement (cash / UPI split), daily expenses and the day's numbers.

- **First real user:** the founder's friend, who runs a small restaurant. Their
  daily pain decides what gets built next.
- **Origin:** a React Native prototype (`github.com/DevaMhatre/tap-2-chef-mobile`,
  WatermelonDB) proved the flow. This repo is the web/PWA product; the prototype
  is reference only — its data model shaped ours, its code is not reused.
- **Server:** Express + MongoDB, auth/roles/validation/tests carried over from the
  founder's `pos-inventory-managment` project.
- **Ambition:** the state-of-the-art product for small restaurants. We think big
  from day one and build the first user's daily flow first.
- **The niche is the strategy.** Small-scale restaurants: one owner, a handful
  of staff, maybe two or three outlets — not franchise chains. Every feature
  solves a real problem of this business: the rush hour, the cash drawer, the
  waiter on a cheap phone, the owner reading the day's numbers at midnight.

### Inspiration, never imitation
We study what the market already does (Toast, Square, Shopify, Petpooja, Linear)
to learn what the industry has learned. We never copy. Every borrowed idea passes
two filters:
1. **Does it solve a real problem for a small restaurant?** Chain-scale power
   (menu versioning, corporate ownership trees) fails this test, so we leave it out.
2. **Can we make it state of the art?** Simpler, faster and calmer than where we
   found it. If we can only match it, rethink it.

### SaaS from day one
Tap2Chef is a subscription product. Multi-tenancy is in the data model now,
even while billing and login come later.

```
Account   (the subscriber; plan, billing)    ← an owner pays and becomes its admin
 └─ Shop  (one restaurant outlet)            ← an owner can run several
     └─ Members (users with a role here)     ← staff work in one or more shops
```

- **Menu is account-level; shops inherit it.** One catalog per account. A new
  shop gets the whole menu on day one and stores only its differences (a price,
  "not sold here") as sparse overrides. One level of inheritance, nothing more.
  A single-shop owner never sees any of it.
- **Permissions, not role names.** Code asks `can(member, 'menu.edit', shopId)`,
  never `role === 'manager'`. `owner` / `manager` / `staff` are preset bundles of
  permissions (data, not code), so custom roles later need no code change. A
  membership is (user, one shop or all shops, role); the owner has everything.
  Permission rules are pure domain functions.
- **Two kinds of identity.** The owner signs a device in once (email/OTP); staff
  switch on a shared device with a personal 4-digit PIN.
- **Scoping:** account-level records (shops, members, menu catalog, subscription)
  carry `accountId`; shop-level records (overrides, tables, orders, expenses)
  carry `accountId` + `shopId`. On the server, one enforced gate refuses any
  query without `accountId`, with tests that prove one tenant can't read
  another's data.
- **Device:** signed into one account, working in one shop at a time. Its local
  database holds only what the signed-in member is allowed to see, and the
  server decides that. Domain and use cases never see `accountId` or `shopId`;
  the composition root scopes the ports.
- **Subscription vs offline:** a lapsed or unreachable licence never blocks
  taking an order mid-service. Entitlements are cached with a grace period.

### Platform
Offline-first PWA, responsive on every platform: phone (bottom tabs), tablet and
desktop (sidebar). Installable; must open and work with no internet.

- Every read and write goes to the local store (IndexedDB via Dexie). The
  network is never on the critical path of taking an order.
- Service workers need https or localhost.
- Known platform limits — design around them, don't fight them:
  - Bluetooth thermal printing: Web Bluetooth works on Android Chrome only.
    Elsewhere: print dialog or WhatsApp share.
  - iOS Safari may evict storage of sites not used for a while. Installed PWA +
    `navigator.storage.persist()` + server sync are the mitigation.

---

## Design North Star

Build it the way Steve Jobs built products: as if he were designing and
developing Tap2Chef himself. Ruthless focus, simplicity that comes from deep
understanding, care for the parts nobody sees, and the whole product working as
one. Follow Apple's Human Interface Guidelines in spirit: clarity, deference,
depth. Every feature passes the **Steve Jobs Product Test** (below) before it is
done.

> Never put Apple's or Steve Jobs' name, logos or likeness in the product, store
> listing or marketing. That is the bar we hold ourselves to; the brand is Tap2Chef.

- **Content first.** Big, tabular-figure numbers; quiet chrome; no heavy shadows
  or decoration. If an element doesn't help the owner act, remove it.
- **One obvious primary action per screen.** Firing an order: ≤ 3 taps from the
  table grid.
- **Touch targets ≥ 44px.** One-handed use on a phone in a busy kitchen.
- **Familiar patterns:** sheets for settle/add flows, grouped inset lists,
  steppers for quantity, segmented controls, system font stack.
- **Motion** is spring-based, brief and purposeful; respect
  `prefers-reduced-motion`.
- **Feedback:** subtle haptic (`navigator.vibrate`, Android) on commits; state
  changes are visible immediately (optimistic, local-first).
- **Light/dark parity.** Colours are tokens in `src/index.css` (`@theme`); never
  hardcode hex in components.
- **Forgiveness:** destructive actions are undoable or confirmed in a sheet.
- Shared visual primitives live in `src/ui/design-system/`. Screens compose
  primitives; they don't restyle them.

---

## Core Philosophy

The primary question before touching any file is **"what changes independently
of what?"** Modules exist to isolate change.

**Cardinal rule:** invariants must never depend on variation points.

### Tap2Chef invariants (domain)
- Money is whole **paise** (`Paise` in `src/domain/money.ts`). Never floats.
- An order line **snapshots item name and price** when ordered. Menu edits never
  change past bills.
- Order status only moves forward: draft → cooking → served → settled.
- A bill settles only when payments sum **exactly** to the total.
- Every record belongs to an account; shop-level records also belong to a shop.

### Tap2Chef variation points
- Order channel: `{ type: 'dineIn'; table } | { type: 'takeaway'; token }` (delivery later = new arm).
- Payment: `{ method: 'cash'; amount } | { method: 'upi'; amount; ref? }` — a list, so bills can split.
- Storage: Dexie today, server sync later — behind ports.
- Printing: Web Bluetooth / print dialog / WhatsApp share — behind one port.

---

## The Three Layers

Dependencies point inward, toward stability.

```
UI LAYER          changes every sprint   src/ui/            display state · forward gestures · visual-only state
USE CASE LAYER    changes monthly        src/usecases/      orchestrates rules · ports · context
DOMAIN LAYER      changes rarely         src/domain/        types · pure rules · no framework
INFRASTRUCTURE    adapters               src/infrastructure/ Dexie, network, sync ACL, printers — implements ports
```

`src/App.tsx` is the **composition root**: the only file that wires
infrastructure into ports.

### Domain (`src/domain/`)
- Types, discriminated unions, pure functions (`orderTotal`, `canTransition`,
  `validateSettlement`).
- Imports nothing from React, Dexie, browser APIs or infrastructure.
- Tested with plain Vitest calls, zero mocks.
- **Discriminated unions over flat nullable bags.**

```ts
// ✅
type OrderState =
  | { status: 'cooking'; firedAt: number }
  | { status: 'served'; servedAt: number }
  | { status: 'settled'; settledAt: number; payments: Payment[] }

// ❌
type Order = { status: string; servedAt?: number | null; payments?: Payment[] | null }
```

### Use cases (`src/usecases/`)
- One hook per user intention: `useMenuBuilder`, `useFireOrder`, `useSettleBill`.
- Imports domain types and **ports** (`src/usecases/ports.ts`) only — never Dexie,
  never components, no JSX except context providers.
- Reaches infrastructure through `usePorts()` (React Context), so tests inject
  fakes. Tested with `renderHook` (jsdom) and fake ports.
- Owns: guards, timing, error propagation, idempotency.
- **The Flutter test:** logic you'd keep if rebuilt in Flutter belongs here.

### Infrastructure (`src/infrastructure/`)
- Implements ports. Knows Dexie, `navigator`, `fetch`, Web Bluetooth.
- **Anti-Corruption Layer:** one adapter per external boundary translates domain
  ↔ wire format (server JSON, sync payloads). Domain never speaks wire format.
- Writes go through `save()` / `remove()` in `infrastructure/db/repo.ts` so every
  change lands in the outbox in the same transaction.
- Records carry `id` (generated on device), `tenantId`, `createdAt`,
  `updatedAt`, `deleted` (soft delete). Sync conflict rule: last write wins, in
  the **server's arrival order**, never device clocks (cheap phones often show
  the wrong time). Clients pull "changes since sync number N", not by timestamp.

### UI (`src/ui/`)
- Three jobs only: display state, forward gestures, own visual-only state.
- Makes no business decisions; no Dexie, no `fetch`, no guards.
- Sub-layers: page shell (reads use case) → feature-specific UI → design-system primitives.

---

## Communication Between Layers

1. **State flows down** (domain → use case → UI). UI never originates business state.
2. **Commands flow up.** UI reports gestures; the use case decides.

```ts
// ❌ Ask
if (cart.length > 0 && !isFiring) fireOrder()
// ✅ Tell
onFirePressed()   // use case owns the guard
```

**Import statement test:** every import is a dependency declaration.
- domain → react/dexie ❌ · usecase → component or dexie ❌ · ui → dexie ❌
- ui → usecase ✅ · usecase → domain/ports ✅ · infrastructure → ports/domain ✅

React Context is the channel; no prop drilling 3+ levels.

---

## Starting a New Feature — Sequence

1. **Domain contract** — types and pure rules, with tests.
2. **Use case** — one hook per intention, against ports, with `renderHook` tests.
3. **Infrastructure** — implement any new port; wire it in `App.tsx`.
4. **UI shell** — thin page reading the use case.
5. **Feature UI** — only the genuinely unique part; reuse design-system primitives.
6. **Register** — add the route. Adding a variant (new payment method, new order
   channel) should touch zero existing feature files (the Lego property).

---

## Code Review Checklist

**Layers**
- [ ] Domain: no React/Dexie/browser imports
- [ ] Use cases: no Dexie, no component imports; testable with fake ports
- [ ] UI: no Dexie, no `fetch`, no guard logic

**Correctness**
- [ ] Rapid-tap safety: synchronous `useRef` guards on fire/settle/save — `useState` is not enough
- [ ] Idempotency: an order's id is created when the order is opened, so a double fire can't duplicate it
- [ ] Unmount safety: in-flight `fetch` cancelled via `AbortController`
- [ ] `fetch`: `response.ok` checked before `.json()`
- [ ] `??` not `||` for numbers that can be `0` (₹0 items, 0 quantity checks)
- [ ] Money: `Paise` everywhere; rupees only at the input/format edge
- [ ] Errors: `throw new Error(msg)` / `reject(new Error(msg))`, never a bare string
- [ ] Offline: works with network disabled; nothing awaits the network to update UI

**Design**
- [ ] Phone, tablet and desktop layouts checked; no horizontal scroll at 360px
- [ ] Targets ≥ 44px; one primary action; light and dark both correct
- [ ] Tokens only; no hardcoded colours

---

## The Steve Jobs Product Test

Run after every feature, before calling it done. Report the result honestly,
including what failed and what was cut. Each question needs a concrete answer,
not a yes.

0. **Real problem.** Which real problem of a small restaurant does this solve,
   and how do they cope with it today? If we can't name it, don't build it.
1. **Focus.** What did we say no to? What can still be removed without loss?
2. **Simplicity.** Could the restaurant owner use it first time, mid-rush, with
   no explanation? Where would they hesitate?
3. **It just works.** No setup, no configuration, no "sync first". Works offline,
   on a cheap Android phone, on the first try.
4. **Taps.** Count the taps for the main job. Can any be removed?
5. **The back of the fence.** Empty states, errors, ₹0, very long names,
   offline mid-action, two devices, dark mode, 360px. Polished where nobody
   looks.
6. **Feel.** Every tap answers instantly; motion and haptics feel natural.
7. **One product.** Consistent with every other screen. Nothing feels bolted on.
8. **Stage test.** Would we demo it on a stage, unrehearsed, with pride?
   If not, it isn't done.

---

## Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| Business rule in a component | Move to use case |
| Flat nullable bag | Discriminated union |
| `useState` as a submit guard | `useRef` guard |
| Domain type defined in a component file | Move to `src/domain/` |
| Component or hook imports Dexie | Port + infrastructure adapter |
| Float rupees in state or storage | `Paise` |
| Order line reading live item price | Snapshot name + price on the line |
| `||` on numeric field | `??` |
| Props drilled 3+ levels | Context |
| Network call on the order path | Local write; sync later |

---

## Commands

Node 22 (`nvm use`).

```bash
cd client && npm run dev        # dev server (PWA enabled in dev)
cd client && npm run typecheck  # tsc --noEmit — must be zero errors
cd client && npm run lint
cd client && npm test           # vitest
cd client && npm run build      # tsc + vite build + service worker
cd server && npm test           # jest + supertest, in-memory Mongo
```

Before reporting work complete: typecheck, lint, tests and build all pass.

---

## Working With This User

- Architecture: go deep, brainstorm at the principle level before proposing files.
- When proposing a change, state which layer it belongs to and why.
- Adversarial review of edge cases: rapid taps, unmount mid-request, ₹0 and 0
  quantities, offline mid-action, two devices editing the same order.
- **Running functionality must never break.**
- Commits: one meaningful commit per logical change; message explains *why*.
  Commit or push only when asked.
- Responses: concise, results stated directly, no trailing summaries.

---

## Roadmap

Lives in [`PLAN.md`](PLAN.md), with what's done, every decision and the open
questions. Not repeated here.
