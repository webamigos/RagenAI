# ADR-41: One Component Library, and It Is shadcn/ui

**Status:** Accepted and **implemented**. Phased, and each phase left the app
working.
**Date:** 2026-09-07

## Update: done, 2026-09-07

`apps/web/src/libs/tui/` is gone, along with the `@ragenai/tui` path aliases in
`apps/web/tsconfig.json` and `apps/web/evals/tsconfig.json`. Nothing in
`apps/web` or `apps/admin` imports it. The five steps below ran roughly as
planned; four things went differently and are worth recording.

**Step 1 removed more than eleven files, and step 3 less than nine.** The
counts in this ADR were taken before steps 2–4 changed the picture. What
actually happened: `sidebar`/`sidebar-layout` went first (#930), then the
wrappers (#928), then the remaining ten files fell in #933 and this change.

**Two components had no shadcn counterpart installed, and were written here
instead** — `pagination` and `navbar`, against the token layer, the same call
the sidebar made. shadcn ships a pagination; installing it for one link-based
call site was more surface than writing it.

**The checkbox split in two.** Seven of its ten call sites were a picture of a
control inside a `<button>` that owned the click, and Radix's `Checkbox`
renders a `<button role="checkbox">` — so a uniform swap would have nested a
button inside a button in seven places. Those became `CheckboxGlyph`, an
`aria-hidden` span; only the three real controls took the Radix one.

**`@headlessui/react` stays**, exactly as the Consequences section warned it
might. Eleven files still use it directly — `common-ui`'s `Dialog`, `Dropdown`,
`Switch`, `Avatar`, `Skeleton` and `SidebarLayout`, plus three pages and the
shared ESLint config. Removing the kit did not remove the dependency, and
whether those follow is a separate decision.

Two things fell out that were not the point but were worth having: several
Tailwind variants in the replaced components turned out never to have matched
anything (see [`../lessons.md`](../lessons.md)), and with the kit gone the
repository has **no non-Apache path left at all** — see
[`../open-core-boundary.md`](../open-core-boundary.md).

**Not decided here, still:** whether `common-ui` and `components/ui` eventually
merge. Two directories remain, but one is ours and one is vendored-by-copy,
which is a different situation from the two competing libraries this ADR was
written about.

## Context

> **Correction, found while executing step 3:** there are **three** component
> layers, not two. `apps/web/src/libs/common-ui/` — aliased
> `@ragenai/common-ui`, 30 components, **122 importing files** — is the
> repository's own set, and by that measure the largest of the three. It is not
> a competitor to consolidate away: it is where our own components belong, and
> two of them (`Skeleton`, `EmptyState`) were living in `libs/tui` and have
> been moved there. What it does do is wrap the kit — `common-ui/Button`
> translates its own API onto the kit's Button and hardcodes
> `color: 'indigo'`, which is why the app's default button is still not the
> brand colour. Step 4 has to account for that; the counts below cover only
> the two libraries the ADR originally compared.

`apps/web` carries **two overlapping component libraries**, and has for long
enough that the newer one has quietly become the majority:

|                                             | files importing it |
| ------------------------------------------- | ------------------ |
| `@/components/ui/*` (shadcn)                | **87**             |
| `@ragenai/tui/*` (`apps/web/src/libs/tui/`) | **48**             |

They are not complementary. Nine components exist in both:

> alert, avatar, badge, button, dialog, input, select, switch, textarea

So the app has two buttons, two dialogs, two inputs, two selects. Which one a
given screen uses is a matter of when it was written, not of what it needed,
and the two do not share a token layer — which is a large part of why the
colour audit in the change that introduced ADR-41's sibling work found 3830
hard-coded colour classes against 824 uses of the semantic tokens.

### The surface is smaller than 48 files suggests

Measured per component, `tui` usage is extremely concentrated:

| component                                                               | files  | note                     |
| ----------------------------------------------------------------------- | ------ | ------------------------ |
| `sidebar`                                                               | 17     |                          |
| `sidebar-layout`                                                        | 14     |                          |
| `skeleton`, `navbar`, `empty-state`                                     | 6 each |                          |
| `dropdown`                                                              | 4      |                          |
| `switch`, `button`, `badge`                                             | 3 each | shadcn already has these |
| `fieldset`                                                              | 2      |                          |
| `select`, `pagination`, `listbox`, `link`, `input`, `heading`, `avatar` | 1 each | four already in shadcn   |

`sidebar` + `sidebar-layout` are 31 of the 48. Everything else is single
digits.

And **eleven of the 29 components have no importer at all** — checked both by
subpath (`@ragenai/tui/x`) and through the barrel, which turns out to be used
for exactly one export (`Checkbox`):

> auth-layout, combobox, description-list, divider, radio, stacked-layout,
> table, text, alert, dialog, textarea

That is dead code with a maintenance surface: it appears in dependency audits,
in lint runs, in `npm run verify`, and in every future reader's mental model of
"the component library".

## Decision

Consolidate on **shadcn/ui**, and remove `apps/web/src/libs/tui/`.

### Why shadcn is the survivor rather than the other direction

Consolidating either way removes the duplication, so the direction has to be
argued rather than assumed:

1. **It is already the majority** — 87 files to 48. The smaller migration is
   the one that moves 48.
2. **Its components are vendored into the repository**, not consumed from a
   package. They are ordinary files under `src/components/ui/`, editable in
   place and versioned with the app, so a change to a primitive is a normal
   diff rather than a fork or a wrapper. This repository has already paid for
   the alternative: [ADR-33](33-shared-platform-contracts-package.md) exists
   because values copied between workspaces drift, and a component library you
   cannot edit invites exactly that pattern of local re-copies.
3. **MIT**, which is the same permissive footing as the rest of the
   dependency tree.
4. **The token work already targets its semantic layer.** The colour system
   (`--primary`, `--ring`, `--muted-foreground`, the `paper` ramp) was wired to
   shadcn's variables. `tui` reads none of them; every `tui` component
   hard-codes `zinc`. Keeping `tui` means keeping a second colour system
   permanently, or migrating it — and migrating it is strictly more work than
   replacing it.

## How, in order

Ordered by leverage: the cheapest, least risky work removes the most surface.

1. **Delete the eleven unused components.** No importers, so nothing to
   migrate and nothing to verify beyond `npm run verify`. This removes 38% of
   the library for free.
2. **Replace the nine duplicates** with the shadcn equivalents that already
   exist. Between them they have 0–3 importers each, so this is a handful of
   import swaps and prop reconciliation per component.
3. **Replace the long tail** — `skeleton`, `navbar`, `empty-state`,
   `dropdown`, `fieldset`, `pagination`, `listbox`, `link`, `heading`. Some
   have shadcn counterparts (`separator` for `divider`, `scroll-area`,
   `dropdown-menu` for `dropdown`); the rest are small enough to write against
   the token layer directly, which is preferable to importing a primitive for
   one call site.
4. **Replace `sidebar` and `sidebar-layout` last** — 31 files, and the panel
   shell every authenticated screen renders inside. shadcn has its own sidebar
   primitive; confirm what the CLI actually installs before planning against
   it rather than against memory of its API.
5. **Delete the directory and its path aliases** (`@ragenai/tui`,
   `@ragenai/tui/*` in `apps/web/tsconfig.json`), and the `tui/` line from
   `AGENTS.md`'s library list.

Steps 1 and 2 are worth doing even if the rest stalls: they remove dead code
and a genuine source of confusion without touching a single rendered screen.

## Consequences

**What improves:**

- One component library, one token layer. A palette change becomes a change to
  variables rather than a sweep through two systems.
- Dead code goes. Eleven files stop appearing in audits and in readers'
  assumptions.
- The nine duplicate pairs stop being a coin flip for whoever writes the next
  screen.

**What it costs, not minimised:**

- Step 4 touches the panel shell. Every authenticated screen renders inside
  `sidebar-layout`, so a regression there is a regression everywhere, and it is
  the one step that genuinely needs a person looking at the result in both
  themes rather than a passing test suite. It is last for that reason.
- `tui` components are Headless UI based (`@headlessui/react`); shadcn is Radix
  based. Keyboard and focus behaviour is comparable but not identical, so
  dropdown and listbox replacements need checking against a keyboard rather
  than by eye. `@headlessui/react` can only be dropped once nothing else uses
  it — check before assuming step 5 removes the dependency.
- Visual drift. The two libraries have different default radii, spacing and
  border treatments. Replacing a primitive changes how a screen looks even
  when the markup is equivalent, and there is no screenshot baseline in this
  repository to catch it.

**Not decided here:** whether `apps/admin` follows. It imports from `tui` too;
the counts above cover both apps, but admin has its own surface and a separate
audience (ADR-35), so it gets its own pass rather than being swept along.

## Alternatives considered

**Keep both.** It works today. Rejected because the cost is not the code, it
is the decision: every new screen starts by picking a library, and the wrong
pick is invisible in review. Two of the nine duplicate pairs already differ in
their focus behaviour.

**Consolidate onto `tui` instead.** Rejected on the numbers — it moves 87
files rather than 48 — and because every `tui` component would then have to be
migrated onto the token layer, which is more work than replacing it.

**Wrap `tui` in token-aware adapters.** Keeps both libraries and adds a third
layer. Rejected: it makes the duplication permanent and harder to see.
