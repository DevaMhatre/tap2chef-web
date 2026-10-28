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
5. Before calling it done, run the end-to-end browser script at 360 / 820 /
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

## Process and testing

**1. The browser script catches what unit tests can't** (2026-10-29)
- *What happened:* Both 6e bugs (the lost discount and the cut-short
  completion moment) passed every unit test. The end-to-end Playwright run
  caught them.
- *Apply:* every feature extends the browser script and runs it at four
  sizes, light and dark, and every screenshot gets read. "Tests pass" is not
  done.

**2. A test fixture must fail loudly** (2026-10-29)
- *What happened:* A fixture fell back to a default when its setup failed,
  which hid a wrong amount.
- *Apply:* if a fixture's setup fails, throw. Never fall back to a default.

**3. Tooling traps**
- The shell defaults to Node 20; the project needs Node 22 (`nvm use`), or
  the jsdom tests won't start.
- zsh doesn't split `$var` into words: use `${=args}` in loops that pass
  arguments.
- A full page reload with the network off fails against the dev server. Test
  offline by navigating inside the app, not with `page.goto`.
