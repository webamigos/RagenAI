# Ragen panel — design system v2 · implementation brief for Claude Code

Paste this file into the repo as `docs/design-system-v2.md`, then work through the
phases in order. Each phase is a separate PR and each has an acceptance check you
can run. Do not start a later phase before the earlier one is merged — phase 1
changes the meaning of tokens the rest depends on.

**Repo**: `webamigos/ragen`, branch `main`. Everything below is inside `apps/web`
unless stated otherwise.

**Reference material in this handoff**
- `ragen-tokens.css` — the finished token layer, drop-in.
- `ragen-ux-rules.md` — 26 rules; these go into `AGENTS.md`.
- `screenshots/01…08` — the eight target screens rendered at 1440px.

---

## What is changing, in one paragraph

The palette is not changing. `--color-brand-*`, `--color-crimson-*` and
`--color-paper-*` in `apps/web/src/app/[locale]/global.css` stay value-for-value.
What changes is everything the palette was competing with: six legacy colour
sets are deleted, `--primary` becomes the brand navy in dark mode as well as
light, the radius drops from 10px to 6px, a control-height scale replaces
shadcn's `h-9` default, Barlow Condensed is added for titles only, and crimson
gains one narrow non-destructive job (`--marker`). Then three screens get real
layout work: the sidebar, the composer and the file table.

---

## Phase 1 — the token layer

**Files**: `apps/web/src/app/[locale]/global.css`, `apps/web/src/app/[locale]/layout.tsx`

1. Replace the `@theme`, `:root`, `.dark` and `@theme inline` blocks with the
   contents of `ragen-tokens.css`. Keep, unchanged and below it: the KaTeX and
   `tw-animate-css` imports, the `@plugin` lines, the `@custom-variant dark`
   line, the ProseMirror block, the `voice-wave` keyframes, the
   `.panel-content-wrapper:has([data-panel-fullwidth])` rule and the
   `document-preview.css` / `chat-response.css` imports.
2. Delete these variables and fix every call site (see step 3):
   `--color-ragen-red`, `--color-ragen-blue`, `--color-primary-light`,
   `--color-primary-dark`, `--color-secondary-dark`, `--color-accent-dark-300/500/700`,
   `--color-accent-dark-lightness`, `--color-primary-blue-400/500`,
   `--color-primary-gray-200`, `--color-success-green`.
3. Load Barlow Condensed. In `layout.tsx`, next to the existing Inter setup:
   ```ts
   import { Barlow_Condensed } from 'next/font/google'
   const display = Barlow_Condensed({
     subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700'],
     variable: '--font-display-loaded', display: 'swap',
   })
   ```
   Add `display.variable` to the `<html>` className and point `--font-display`
   at `var(--font-display-loaded)` in the `@theme` block.
   `latin-ext` is not optional — the UI ships Polish copy.

**Acceptance**: `pnpm build` passes; `rg -n "ragen-blue|primary-blue-|accent-dark-|success-green" apps/web/src` returns nothing; the app renders in light and dark with no unstyled regions.

---

## Phase 2 — the literal-colour sweep

The current code holds roughly 3 800 literal Tailwind colour classes against 800
uses of the semantic tokens, across three accents (indigo, blue, violet) and two
neutrals (zinc, gray). Phase 1 is pointless until this is done.

Work file by file, not with a global regex. The mapping:

| Found | Replace with |
| --- | --- |
| `bg-indigo-600`, `bg-blue-600`, `bg-violet-*` (as an action) | `bg-primary text-primary-foreground` |
| `text-indigo-600`, `text-blue-600` (as a link) | `text-primary` |
| `bg-indigo-50`, `bg-blue-50` (as a hover or active fill) | `bg-accent text-accent-foreground` |
| `border-zinc-200`, `border-gray-200` | `border-border` |
| `bg-zinc-50`, `bg-gray-50` (page ground) | `bg-background` |
| `bg-white` (a panel surface) | `bg-card` |
| `text-zinc-500`, `text-gray-500` | `text-muted-foreground` |
| `text-zinc-900`, `text-gray-900`, `text-black` | `text-foreground` |
| `bg-red-*`, `text-red-*` (a destructive action) | `bg-destructive` / `text-destructive` |
| `bg-red-*` (a failed document state) | the Failed badge below — not a bare red |
| `bg-green-*`, `bg-amber-*`, `bg-yellow-*`, `bg-orange-*` | `bg-[--color-ready-tint]` / `bg-[--color-pending-tint]` via the badge |
| any literal `rounded-xl` / `rounded-2xl` on a panel | `rounded-lg` |

Two things that are **not** a mechanical swap and need a judgement per call site:
a literal red that is a *document state* becomes a badge, not a colour; and a
literal indigo that is an *active nav item* becomes the marker pattern (below).

**Acceptance**: `rg -n "(bg|text|border)-(indigo|violet|zinc|gray|slate)-" apps/web/src | wc -l` is under 100, and every survivor is deliberate (chart series, syntax highlighting, third-party embeds). Add a lint rule if you want it to stay that way.

---

## Phase 3 — component primitives

**`components/ui/button.tsx`** — keep the variant structure, change three things:
`default` size becomes `h-8 px-3`, `lg` becomes `h-9 px-4`, `sm` stays `h-7`.
The `destructive` variant keeps crimson. Add nothing else; the tokens do the rest.

**`components/ui/card.tsx`** — remove any `shadow-*`; a card is
`border border-border bg-card rounded-lg`. Shadow is reserved for popover,
dropdown, dialog, toast and the command palette.

**New `components/ui/status-badge.tsx`** — one component, four states, used
everywhere a document or job state is displayed. It replaces every ad-hoc pill:

```tsx
type State = 'ready' | 'processing' | 'failed' | 'queued'
// ready:      bg-[--color-ready-tint]  text-[oklch(0.42_0.11_152)]  dot --color-ready
// processing: bg-[--color-pending-tint] text-[oklch(0.48_0.11_70)]  dot --color-pending
//             + optional determinate percentage as the label ("62 %")
// failed:     bg-crimson-50 text-crimson-700 dot --color-signal
// queued:     bg-muted text-muted-foreground dot paper-400
```
Height 20px, 4px radius, 11px medium label, 5px dot, always a word (or a
percentage) — never colour alone.

**New `components/ui/marker-nav-item.tsx`** — or extend the existing sidebar
button. The active state is exactly: `bg-accent text-accent-foreground
font-medium` plus `shadow-[inset_2px_0_0_var(--marker)]`. This inset rail and the
citation marker are crimson's whole non-destructive budget. Nothing else in the
product gets a crimson fill.

**Acceptance**: `rg -n "bg-(green|amber|yellow|emerald)" apps/web/src` returns nothing; every state pill in the app is `<StatusBadge>`.

---

## Phase 4 — the sidebar

**Screenshot**: `01-new-chat.png` (left 248px)

The current sidebar mixes actions and destinations in one flat list, and "Chats"
sits next to "Assistants" and "Recent" with no stated relationship. Restructure
into four zones, in this order, separated by a 1px `border-border` rule:

1. **Brand row**, 48px: mark, "Ragen", collapse toggle.
2. **Actions**: New chat (primary button, full width, 32px), Search (with a right-
   aligned `⌘K` hint in `font-mono` 10px), Notifications (with an unread count badge).
3. **Library**, under an eyebrow label: Threads, Assistants, Knowledge — each with
   a right-aligned count in tabular numerals. These are the only destinations.
4. **Recent**, grouped by day (`Today`, `Yesterday`, then dates), 28px rows,
   12px text, single-line ellipsis. No "New thread" button here — that duplicates
   New chat, which is what makes the current sidebar ambiguous.
5. **Footer**, pinned: org switcher (20px square avatar, 32px row), then user
   (24px round avatar, 36px row, name + role on two lines).

Rows are 30px in zones 2–3 and 28px in Recent. Icons are Lucide at 15px,
stroke 1.5. Active item uses the marker pattern from phase 3.

**Acceptance**: the sidebar renders three visually separated zones at 248px; keyboard tab order runs top to bottom; the collapsed state keeps zone 2 and 3 as icon-only rows with tooltips.

---

## Phase 5 — the composer

**Screenshots**: `01-new-chat.png` (centre), `02-conversation-sources.png` (bottom)

The composer owns the new-chat page. Two states, one component.

**Full state (new chat)**: a bordered 8px-radius card. Text area on top, minimum
64px. A control row underneath, separated by a 1px `border-[--color-paper-100]`
rule, holding — left to right — **Attach** (outline, 28px), **Knowledge: {scope}**
(accent-tinted, 28px, opens a folder/assistant scope picker), then pushed right:
the **model picker** (28px, `font-mono` 12px, shows the model id), and the
**send** button (36px square, `bg-primary`).

All three controls are visible, always. The current build hides model and
attachments, which is the single most-reported friction in this panel.

**Compact state (inside a thread)**: one 40px row — placeholder, model id as
plain 11px text, 28px send button. Same component, `variant="compact"`.

Around it on the new-chat page, in this order and starting at the top of the
pane (nothing centres vertically):
greeting line 12px muted → title in `--font-display` 30px → composer →
**Start from**: four suggestion cards in a `minmax(230px, 1fr)` grid →
**Pick up where you left off**: three most recent threads as 34px rows with
assistant name and relative time.

**Acceptance**: model, attach and scope are reachable in one click from an empty chat; the pane has no vertical centring; at 1280px the suggestion grid is 3-up, at 900px 2-up, at 600px 1-up.

---

## Phase 6 — answers and sources

**Screenshot**: `02-conversation-sources.png`

1. **Retrieval row**. Above every answer that used retrieval, one 26px bordered
   row: magnifier icon, `Searched {n} documents · {m} chunks · {ms} ms`, chevron.
   Expands to the chunk list. While retrieval is running the same row shows
   `Searching {n} documents…` — never a bare spinner.
2. **Inline markers**. `[n]` rendered as a 15px crimson-tinted chip
   (`bg-crimson-50 text-crimson-700`, 3px radius, 10px semibold, tabular).
   Clicking scrolls the matching source card into the rail and highlights it.
   Renderer: extend the existing markdown pipeline in
   `app/components/Assistant/ChatOutput/`; do not post-process the HTML string.
3. **Sources block**, under the answer body: eyebrow `Sources`, then one card per
   source — marker chip, `{file} · page {n}`, and a quoted snippet in 12px.
   More than two sources collapse behind `Show {n} more sources`.
4. **No-retrieval case**: `Answered without your documents` as a single muted
   11px line above the answer. Never silence.
5. **Sources rail**, 296px, right side, dismissible and remembered per user:
   one card per document with a relevance bar (`--primary` fill on
   `--border` track), the chunk count and the page list. Masked values render as
   `[PESEL]` in every snippet, with the note that originals were removed at
   ingestion.
6. **Message actions** appear only after the answer completes: Copy, Regenerate,
   then thumb up / thumb down as 26px icon buttons. While streaming, Send becomes
   Stop.

**Acceptance**: an answer with citations shows markers, a sources block and a populated rail; an answer without retrieval says so; clicking a marker highlights the right rail card.

---

## Phase 7 — the file table

**Screenshot**: `03-knowledge-base.png`

Columns, in order: selection checkbox (28px) · file name (`minmax(220px, 1fr)`,
with a type tag in `font-mono` 9px) · size (76px, right, tabular) · added (128px,
tabular, `6 Sep, 12:54` format) · status (108px, `<StatusBadge>`) · PII policy
(168px, a 24px quiet select showing the policy name) · row menu (32px).

Rules that matter:
- Rows are 34px. Header is 30px with 11px uppercase display-font labels.
- Row rules are `--color-paper-100`, not `--border` — the grid reads without
  ruling every cell.
- The row grid has `min-width: 840px` and the table body sits in an
  `overflow-x: auto` wrapper, so the name column never collapses. Below 840px the
  table scrolls; it does not squeeze.
- Selection bar appears above the header when anything is checked: count, then
  Move to folder / Change policy / Reprocess / Delete (the only crimson button).
- Filters are chips above the table showing their value (`Status: Processing`),
  with an `×` when set and a `Clear all` link once any is set.
- `Processing` shows a percentage as its label when progress is known.
- Left rail, 216px: scope (All files / My files / Shared with me, with counts),
  folders (each showing a policy tag when it overrides the default), and a usage
  block pinned to the bottom with a storage bar and pages indexed.

**Acceptance**: at 1440px all seven columns are visible with no clipping; at 900px the table scrolls horizontally and the name column still reads; the PII select changes trigger the existing reprocess confirmation.

---

## Phase 8 — settings, search, notifications

**Settings** (`06-settings.png`). Merge the user-settings and organization-settings
routes into one surface with a 216px rail grouped under three eyebrows:
**You** (General, Account, Connectors, Shared threads) · **Privacy** (PII policy,
Knowledge analytics) · **Organization** (Members & teams, RAG pipeline,
Security & audit, Usage & API keys). Content column caps at 620px, sections are
`display` 20px title + 12px muted description + control. Preference changes save
on change with no Save button; credential changes keep an explicit action.
See `docs/settings-pages.md` for the current route list.

**Search** (`07-search-palette.png`). One `⌘K` palette over everything, results
grouped `Documents` / `Threads` / `Actions`, 32px rows, the query highlighted in
semibold inside each result, a per-group right-hand meta column (folder, relative
time, `↵`). The last group is always an action — "Ask {assistant} about {query}" —
so a miss is still a route forward.

**Notifications** (`08-notifications-dark.png`, shown in dark). Grouped by day,
each item a 6px-radius block with a 22px tinted icon square, title, one line of
detail, an inline action and a timestamp. The left inset rail encodes severity:
crimson for failures, brand for social and informational. Unread items carry the
card surface; read items are transparent.

**Acceptance**: every settings route from `docs/settings-pages.md` is reachable from one rail; `⌘K` opens the palette from any panel route; a processing failure produces a notification with a working "Open file" action.

---

## Definition of done

- No literal accent or neutral Tailwind colour outside the exceptions in phase 2.
- Every panel screen renders in light and dark with no hard-coded surface colour.
- Focus ring is `2px var(--ring)` at `2px` offset on every interactive element.
- Body text is 13px or larger; metadata at 11px clears 4.5:1.
- Hit targets are 28px or larger in toolbars, 32px elsewhere.
- Every document state in the UI is a `<StatusBadge>`.
- Crimson appears only as: destructive actions, the marker rail, citation chips,
  the Failed badge, and the logo mark.
- `ragen-ux-rules.md` is merged into `AGENTS.md` and its rules are followed by
  new work without being restated in each prompt.
