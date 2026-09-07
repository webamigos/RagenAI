# ADR-41: One Component Library, and It Is shadcn/ui

**Status:** Accepted, not yet implemented. Phased, and each phase leaves the
app working.
**Date:** 2026-09-07

## Context

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
