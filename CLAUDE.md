# Tap2Chef — Engineering & Design Guide

Read at the start of every session. These are non-negotiable defaults.

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
  founder's `pos-inventory-managment` project. Roles: `owner`, `staff`.

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

Build it as if Apple's senior product designers made a restaurant app.
Follow Apple's Human Interface Guidelines in spirit: clarity, deference, depth.

> Never put Apple's name, logos or "designed by Apple" in the product, store
> listing or marketing. The bar is Apple-quality; the brand is Tap2Chef.

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
- Every record belongs to a tenant.

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
  `updatedAt`, `deleted` (soft delete). Sync conflict rule: latest `updatedAt` wins.

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

1. ~~Repo, client, server~~
2. ~~Installable PWA that opens offline~~
3. ~~Local database + outbox, TypeScript, layered structure~~
4. **Menu builder** — menu profiles, categories, items (next)
5. Table grid and orders (fire → cooking → served)
6. Bill settlement (cash / UPI split)
7. Expenses and the day's dashboard
8. Real login and sync
9. Printing / KOT
