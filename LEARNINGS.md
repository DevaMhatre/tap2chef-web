# Tap2Chef: Learnings

Mistakes we made once and don't intend to make again. `PLAN.md` says what we
decided; git history says why each change was made; this file says **what went
wrong and how we now avoid it**.

- **Start of every feature:** read the checklist below and the lessons under
  the areas the feature touches.
- **When something goes wrong** (a rework, a bug caught late, a correction
  from the owner or the user): add one entry under its area. Each entry has
  the lesson, what happened, and how to apply it. Keep it short. If a lesson
  turns into a rule everyone must follow, move it into `CLAUDE.md` and leave a
  one-line pointer here.

---

## Before building a feature: checklist

1. Write out how the job **really happens** in a small Indian restaurant:
   who does it, in what order, what goes wrong mid-rush. Then study the market
   (Toast, Square, Petpooja), then make our call. (Product 1)
2. For every record two devices could add to at once, give it a record of its
   own. Never use a list on a parent record. (Data 1)
3. Name every control by what it does. A choice only chooses; a commit is a
   button that says what it will do. (Design 1)
4. Check every word on screen against the others on the same screen. (Design 2)
5. Before calling it done, run the end-to-end browser scripts in `e2e/` at 360 / 820 /
   1440, light and dark, and read every screenshot. (Process 1)

---

## Product

**1. Walk the real-life workflow before designing the flow** (2026-10-29)
- *What happened:* Bill settlement (6b) was designed from a market study and
  the brainstorm. It merged "bill handed over" and "money received" into one
  tap. It looked clean, but at a real counter the bill comes first and the
  money comes later, often in parts. The floor had no "waiting to pay" state,
  and the flow had to be rebuilt (6e).
- *Apply:* before any flow, write the real sequence of events step by step,
  including who does each step and what goes wrong in a rush. Check every
  sub-step against it, not just the feature as a whole. The market tells us
  what others built; only the real workflow tells us what is needed.

**2. A brainstorm decision is a hypothesis until the owner confirms it**
(2026-10-29)
- *What happened:* 6b was built while the questions that would have tested it
  (how customers pay UPI, who takes the money) were still open.
- *Apply:* if an open question in `PLAN.md` would change the design, either
  get the answer first or build the smallest version and say plainly which
  assumption it rests on.

## Design

**1. A selection never commits** (2026-10-29)
- *What happened:* Tapping Cash or UPI settled the bill immediately. Settling
  is a conscious act that staff are responsible for, so it needs its own
  button. Apple's HIG says a segmented control chooses a state and never
  performs an action.
- *Apply:* segmented controls, chips and tiles choose. The commit is one
  filled button whose label says what will happen ("Settle ₹660"), and the
  end of a job gets a moment of completion.

**2. Words that collide confuse** (2026-10-29)
- *What happened:* "Change amount" (the discount link) sat right above
  "Change ₹340" (cash to hand back).
- *Apply:* read every label on the screen together. One word means one thing
  on a screen.

**3. Don't crowd a live screen with history** (2026-10-29)
- *What happened:* "Settled today" was listed in full on the Orders tab,
  under the live orders.
- *Apply:* history becomes a summary row you tap into (Wallet, Settings).
  Collapse sections only where the owner edits, never where speed matters
  (the order screen).

**4. Text that fits on a desktop truncates on a phone tile** (2026-10-29)
- *What happened:* "Bill · Just now" was cut off on a 360px table tile, and
  "corrected" was cut off in a list row.
- *Apply:* read the 360px screenshots for ellipses. Prefer shorter words over
  smaller text, and put what needs attention first ("₹410 extra · Cash + UPI"),
  so that if anything gets cut, it's the least important part.

**5. A collapsed section must still look like something to tap** (2026-10-29)
- *What happened:* The first collapsible Menu put chevrons on the small grey
  section labels. Collapsed, it read as a column of captions, with four red
  "Edit"s competing for attention.
- *Apply:* a folding section is a card whose first row is the header (17px,
  with a leading chevron and a quiet count). Its actions show only while it is
  open. Judge the closed state in a screenshot, not just the open one.

## Data and state

**1. Anything two devices can add to is its own record** (2026-10-29)
- *What happened:* Order lines (step 5) and later payments (6e). As a list on
  the order, last-write-wins would let one device's write silently drop the
  other's: a lost dish, or lost money.
- *Apply:* lines, payments, and next expenses and stock movements are records
  with their own ids. A total that comes out wrong (for example "₹660 extra
  received") is shown, never hidden.

**2. Store a union state as one field that is replaced whole** (2026-10-29)
- *What happened:* `writeAll` merges over the stored row. A flattened bill
  would have left stale payment fields behind after an undo.
- *Apply:* store `state` as one nested field, plus a flat `status` only for
  the index.

**3. Seed a form from what is stored, not from blank** (2026-10-29)
- *What happened:* A discount agreed with a part payment was saved. The bill
  sheet then reopened blank, showed ₹360 instead of ₹300, and the next
  payment would have removed the discount.
- *Apply:* when a form edits stored state, the use case provides its starting
  input. Test the "close and reopen" path.

**4. Check commands against the stored state, not the screen's** (2026-10-29)
- *Apply:* settling and paying are planned against the latest snapshot. If
  another tab changed the bill, refuse and say so rather than charge for
  what staff didn't see.

**5. A store that merges hides a field the new record no longer has** (2026-10-29)
- *What happened:* `writeAll` merged each record over the stored row. Undo of a removed payment (6g) put back a record without `removedAt`, the merge kept the old `removedAt`, and the payment stayed removed. Unit tests used the fake repository, which replaces, so they passed. Found by the expenses browser run.
- *Apply:* a write replaces the row whole (only `createdAt` survives). Every adapter gets a round-trip test for "set, then unset" on any optional field. Fakes must behave like the real store on exactly the point under test.

**6. A storage migration meets the old code still running** (2026-10-29)
- *What happened:* the 8a upgrade (tenant → account / shop) passed unit tests and a real upgrade of the live build's data. A second check, with an old tab left open while a new tab upgraded, showed the old tab still writing, now with a fresh `tenantId` and no `accountId`. Deployed code can't be changed, so nothing in the migration could prevent it.
- *Apply:* test every Dexie version bump in real Chrome twice: data written by the live build, upgraded; and a live-build tab left open during the upgrade, then writing. Whatever the old code can still write must be tolerated downstream (here: sync push stamps the scope).

## UI mechanics

**1. Anything that must outlive a screen lives above all screens** (2026-10-29)
- *What happened:* Two cases. One sheet handing over to another closed both
  (step 5). And the completion moment, rendered inside the bill sheet, was
  cut short when a paid takeaway's screen changed underneath it (6e).
- *Apply:* toasts, completion moments and anything timed live in app-level
  providers. Navigation and screen changes then can't cut them short.

**2. Synchronous guards on commits** (step 4 onward)
- *Apply:* a `useRef` guard on the UI and a keyed command in the use case.
  Test a double-tap in the browser script (`dblclick`) as well as in unit
  tests.

**3. A sheet whose own action changes what decides its content** (2026-10-29)
- *What happened:* the account sheet chose "sign in" or "account" from the session. Signing in set the session, the parent swapped sheets, and the "Signed in" moment never showed. Same family as UI 1, met again in a new shape.
- *Apply:* a sheet decides what it shows when it opens and keeps it until it closes. Ask of every sheet: does its own commit change the state that picks its content?

**4. The browser validates before we do** (2026-10-29)
- *What happened:* `type="email"` made the browser stop the form with its own bubble, so our message never showed.
- *Apply:* forms with our own validation get `noValidate`; the browser script checks that our words appear.

## Process and testing

**1. The browser script catches what unit tests can't** (2026-10-29)
- *What happened:* Both 6e bugs (the lost discount and the cut-short
  completion moment) passed every unit test. The end-to-end Playwright run
  caught them.
- *Apply:* every feature extends the browser script and runs it at four
  sizes, light and dark, and every screenshot gets read. "Tests pass" is not
  done.

**1b. The browser scripts live in the repo** (2026-10-29): `e2e/` (`day.mjs`, `bill2.mjs`, `menu.mjs`; see its package.json). Extend them with each feature; after any change to shared storage, re-run all of them, not just the new one.

**1c. A test for a guard must fail without the guard** (2026-10-29)
- *What happened:* the 8b test for "a pull never passes a change still being written" passed with the per-account lock removed. supertest sends a request only when something awaits it, so the "concurrent" pushes never overlapped, and the race never happened.
- *Apply:* for every lock, ref guard or ordering rule, remove it once and watch its test fail. Make a race deterministic (hold one side back with a spy), never hope the timing hits it.

**1d. A test can pass for a reason other than the rule it names** (2026-10-29)
- *What happened:* the 8d test "keeps our version of a record we changed and haven't sent yet" passed with the rule removed: push runs before pull, so our version was already on the server and came back last. The rule only matters for an edit landing between push and pull; a new test puts one exactly there.
- *Apply:* the guard-removal check (1c) applies to rules, not just locks. When a test survives the removal, find the case where the rule is the only thing standing, and test that.

**2. A test fixture must fail loudly** (2026-10-29)
- *What happened:* A fixture fell back to a default when its setup failed,
  which hid a wrong amount.
- *Apply:* if a fixture's setup fails, throw. Never fall back to a default.

**3. Never run an untested script on a live server** (2026-10-29)
- *What happened:* The deploy script for the VPS (moving the sites to .com)
  would have dropped the portfolio's `server_name`, because certbot tags that
  line too. In bash, `a && b` also doesn't stop on a failed `a` under
  `set -e`. A local dry run against a reconstructed config caught both.
- *Apply:* read the live config first (read-only commands), dry-run every
  server script locally against a copy, back up before changing anything,
  restore automatically on failure, and make scripts safe to rerun. One
  command per line in `set -Eeuo pipefail` scripts.

**4. Screenshots need a settled screen** (2026-10-29)
- *What happened:* The first screenshots caught a sheet half risen and a sidebar tab mid-fade, which looked like bugs.
- *Apply:* wait ~500 ms before every screenshot. Seed test data by writing straight into IndexedDB; a screen opened after the write sees it (Dexie live queries don't notice raw writes).

**5. Tooling traps**
- The shell defaults to Node 20; the project needs Node 22 (`nvm use`), or
  the jsdom tests won't start.
- zsh doesn't split `$var` into words: use `${=args}` in loops that pass
  arguments.
- A full page reload with the network off fails against the dev server. Test
  offline by navigating inside the app, not with `page.goto`.
