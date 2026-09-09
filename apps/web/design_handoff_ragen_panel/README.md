# Handoff: Ragen panel — design system v2

## Overview

The Ragen panel (`apps/web` in `webamigos/ragen`) is the interface for a company
AI assistant: chat with retrieval over an organization's documents, a knowledge
base, assistants, and organization administration. This package is an
**evolution**, not a rewrite. The brand palette already in the codebase is kept
value-for-value; what changes is the token layer around it, the density, and the
layout of three screens that were getting in the way of the product's core job:
asking a question and trusting the answer.

The five problems this addresses, named by the product owner:

1. Too much empty space on the start screen.
2. Unclear hierarchy in the sidebar (Chats vs Assistants vs Recent).
3. No visible sources or citations in answers.
4. Model choice and attachments hidden behind menus.
5. The file table is hard to scan.

## About the design files

The two `.dc.html` files in `reference/` are **design references created in
HTML** — prototypes showing intended look, density and behaviour. They are not
production code and none of their markup should be copied into the app. Their
inline styles exist so the prototype paints without a build step; the real
implementation uses Tailwind classes bound to the tokens in `ragen-tokens.css`.

The task is to recreate these designs in the target codebase's existing
environment: **Next.js (App Router, RSC), Tailwind CSS 4, shadcn/ui
(`style: new-york`, `iconLibrary: lucide`)**, following that repo's established
patterns. The one file meant to land in the repo verbatim is
`ragen-tokens.css`, which replaces the token blocks in
`apps/web/src/app/[locale]/global.css`.

Open the references directly in a browser (`reference/support.js` must sit
alongside them), or read the eight PNGs in `screenshots/` — those are the
authoritative visual targets, rendered at 1440px logical width, 2× scale.

## Fidelity

**High-fidelity.** Colours, type sizes, control heights, radii, row heights and
copy are all final and are stated explicitly below and in
`IMPLEMENTATION_BRIEF.md`. Recreate them exactly, using the codebase's existing
shadcn components wherever one exists — do not build parallel primitives. Where
a value is absent from this document, it comes from the token file.

## Where to start

1. Read `IMPLEMENTATION_BRIEF.md`. It is the working plan: eight phases, each a
   separate PR, each with an acceptance check. **Phase order matters** — phase 1
   changes what the tokens mean, and phase 2 (removing ~3 800 literal Tailwind
   colour classes) is what makes phase 1 visible at all.
2. Merge `UX_RULES.md` into the repo's `AGENTS.md`. 26 rules that settle the
   recurring arguments (colour discipline, table density, empty states, copy).
3. Then work the phases.

---

## Design tokens

Full source: `ragen-tokens.css`. Summary of what implementation needs.

### Colour

The three ramps are unchanged from the current `global.css`. Brand navy is the
product's action colour; crimson is rationed; `paper` is the only neutral (it
replaces both `zinc` and `gray`, plus four legacy dark sets).

| Ramp | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `brand` | `#f3f5fc` | `#e3e7f8` | `#c8d0ef` | `#9eabe0` | `#7082cd` | `#465db9` | `#394d9d` | `#2d3e80` | `#243165` | `#1e2752` | `#1c244b` |
| `crimson` | `#fdf1f3` | `#fce4e8` | `#f8c9d2` | `#f09dad` | `#e6657d` | `#de3554` | `#cc1d3e` | `#ab1732` | `#8a152a` | `#711425` | `#450813` |

`paper` is defined in OKLCH at a fixed hue of 273 so it sits with the brand
rather than beside it. Steps, with the hex the prototypes use:

| Step | OKLCH | ≈ hex |
| --- | --- | --- |
| 50 | `oklch(0.988 0.003 273)` | `#fbfbfe` |
| 100 | `oklch(0.972 0.005 273)` | `#f5f5fa` |
| 200 | `oklch(0.922 0.008 273)` | `#e5e5ee` |
| 300 | `oklch(0.872 0.010 273)` | `#d6d6e1` |
| 400 | `oklch(0.708 0.014 273)` | `#a4a4b5` |
| 500 | `oklch(0.556 0.016 273)` | `#75758b` |
| 600 | `oklch(0.452 0.018 273)` | `#5b5b71` |
| 700 | `oklch(0.372 0.022 273)` | `#454558` |
| 800 | `oklch(0.268 0.024 273)` | `#2d2d3d` |
| 900 | `oklch(0.205 0.022 273)` | `#212130` |
| 950 | `oklch(0.145 0.018 273)` | `#16161f` |

Use the OKLCH values in code. The hexes are listed only so a screenshot can be
checked against a colour picker.

Document/job state, the one place the interface encodes genuinely different
information:

| Role | Value |
| --- | --- |
| `--color-ready` | `oklch(0.62 0.15 152)` |
| `--color-ready-tint` | `oklch(0.96 0.03 152)` |
| `--color-pending` | `oklch(0.76 0.145 75)` |
| `--color-pending-tint` | `oklch(0.97 0.04 85)` |
| Failed | reuses `crimson-600` / `crimson-50`, never a new red |

Semantic roles (shadcn layer):

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `paper-100` | `paper-950` |
| `--card` | `#ffffff` | `paper-900` |
| `--popover` | `#ffffff` | `paper-800` |
| `--primary` | `brand-600` | `brand-500` |
| `--primary-foreground` | `#ffffff` | `#ffffff` |
| `--accent` (hover/active fill) | `brand-50` | `paper-800` |
| `--accent-foreground` | `brand-800` | `paper-50` |
| `--muted-foreground` | `paper-500` | `paper-400` |
| `--border` | `paper-200` | `white 10%` |
| `--input` | `paper-300` | `white 18%` |
| `--ring` | `brand-600` | `brand-400` |
| `--destructive` | `crimson-600` | `crimson-400` |
| `--marker` | `crimson-600` | `crimson-400` |
| `--sidebar` | `paper-50` | `oklch(0.175 0.02 273)` |

Two deliberate changes from the current file. `--primary` stays the brand navy
in dark mode instead of handing itself back to near-white (`brand-500` on
`paper-950` with white text clears 4.5:1), so the product has one action colour
in both themes. And `--marker` is new: crimson's one non-destructive job.

**Colour discipline** — this is the rule that keeps the interface legible:

- Navy is the *only* action colour: primary buttons, links, active-nav fill tint,
  focus ring.
- Crimson appears in exactly five places: destructive actions, the 2px active-nav
  rail, citation markers, the Failed badge, and the logo mark. It is never a link,
  never body text, never a second accent, never a large fill.
- Green and amber encode document or job state only — not success messages, not
  decoration.
- State never rests on colour alone: a badge always carries a word or a percentage.

### Type

| Family | Token | Used for |
| --- | --- | --- |
| Inter | `--font-sans` | everything you read |
| Barlow Condensed 500/600/700 | `--font-display` | page titles, section headers, eyebrows, table column headers — nothing else |
| JetBrains Mono | `--font-mono` | model ids, file-type tags, keyboard hints, API keys |

Barlow Condensed must be loaded with `subsets: ['latin', 'latin-ext']` — the UI
ships Polish copy.

| Token | px | Role |
| --- | --- | --- |
| `--text-2xs` | 11 | table meta, badge text, timestamps |
| `--text-xs` | 12 | labels, captions, helper text |
| `--text-sm` | 13 | **UI body**, table cells, buttons, inputs |
| `--text-base` | 14 | chat message body (line-height 1.6–1.65) |
| `--text-lg` | 16 | card titles |
| `--text-xl` | 20 | section headers (display) |
| `--text-2xl` | 26 | page titles (display) |
| `--text-3xl` | 36 | the single empty-state headline |

Eyebrow / column-header style: display font, 11–12px, weight 600, letter-spacing
`.08em`, uppercase, `--muted-foreground`.
Every number that sits in a column carries `font-variant-numeric: tabular-nums`.

### Density, radius, elevation

- `--radius` is **6px** (down from 10px). `sm` 4px for badges and inline chips,
  `md` 6px for buttons, inputs and rows, `lg` 8px for cards and panels. Nothing is
  a pill except the avatar and the status dot.
- Control heights: **24** (inline row actions, table selects) · **28** (toolbars,
  filter chips) · **32** (default button, input, select) · **36** (primary CTA,
  composer send). shadcn's stock `h-9` default is overridden centrally.
- Spacing: 4 · 8 · 12 · 16 · 24 · 32. Inside a control 8; between controls 8–12;
  between panels 16; between page sections 24.
- Elevation: panels are **line drawings** — 1px `--border`, no shadow. A shadow
  means the element floats: popover, dropdown, dialog, toast, command palette.
  `--shadow-pop` for popovers, `--shadow-modal` for dialogs and the palette.
- Icons: Lucide, stroke-width **1.5**, 15px in navigation and rows, 13–14px inside
  28px controls, 16px in the composer send button.

### Accessibility floor

- Focus ring: `2px solid var(--ring)` at `2px` offset on every interactive element.
  Never the browser default.
- Body text ≥ 13px and ≥ 4.5:1; 11px allowed only for metadata that still clears
  4.5:1.
- Hit targets ≥ 28px in toolbars, ≥ 32px elsewhere.

---

## Screens

Eight screens, each with a screenshot. Detailed layout, component and copy specs
are in the matching phase of `IMPLEMENTATION_BRIEF.md`; this is the map.

| # | Screen | Screenshot | Purpose | Brief phase |
| --- | --- | --- | --- | --- |
| 01 | New chat | `screenshots/01-new-chat.png` | Start a question; the composer owns the page | 4 (sidebar), 5 (composer) |
| 02 | Conversation with sources | `screenshots/02-conversation-sources.png` | Read an answer and check where it came from | 6 |
| 03 | Knowledge base | `screenshots/03-knowledge-base.png` | Scan, filter and administer documents | 7 |
| 04 | Assistants | `screenshots/04-assistants.png` | See what each assistant is scoped to | 3 (primitives) |
| 05 | Members | `screenshots/05-members.png` | Roles and invitations | 3 |
| 06 | Settings | `screenshots/06-settings.png` | One surface for user + org settings | 8 |
| 07 | Search palette | `screenshots/07-search-palette.png` | `⌘K` over documents, threads and actions | 8 |
| 08 | Notifications (dark) | `screenshots/08-notifications-dark.png` | Processing failures and shares; also the dark-mode specimen | 8 |

Screens 01–03 carry the real design work. 04–08 apply the same system to
existing pages and are mostly a matter of swapping primitives and density.

### The three structural changes, in short

**Sidebar** (248px, screen 01). Four zones separated by 1px rules: brand row →
actions (New chat, Search with `⌘K`, Notifications with unread count) → Library
(Threads, Assistants, Knowledge, each with a right-aligned tabular count) →
Recent grouped by day → pinned footer (org switcher, then user). Rows are 30px in
the action and library zones, 28px in Recent. The active item is
`bg-accent text-accent-foreground font-medium` plus
`box-shadow: inset 2px 0 0 var(--marker)`. The duplicate "New thread" button is
removed — it was the same action as New chat, which is what made the old sidebar
ambiguous.

**Composer** (screens 01, 02). One component, two variants. Full: bordered 8px
card, ≥64px text area, then a control row with **Attach** (28px outline),
**Knowledge: {scope}** (28px accent-tinted, opens the folder/assistant scope
picker), and pushed right the **model picker** (28px, mono 12px, shows the model
id) and a **36px square send button** in `--primary`. All three controls are
always visible — hiding model and attachments is the panel's most-reported
friction. Compact (inside a thread): a single 40px row with placeholder, model id
as plain 11px text, and a 28px send button. Nothing on the new-chat page centres
vertically; content starts at the top of the safe area and the space below the
composer carries four suggestion cards and the three most recent threads.

**Answer with sources** (screen 02). Above the answer, one 26px row:
`Searched {n} documents · {m} chunks · {ms} ms`, expandable to the chunk list —
while retrieval runs the same row reads `Searching {n} documents…`, never a bare
spinner. In the body, `[n]` markers render as 15px crimson-tinted chips
(`crimson-50` / `crimson-700`, 3px radius, 10px semibold, tabular) produced by
the markdown pipeline, not by post-processing HTML. Under the answer, a
**Sources** block: one card per source with the marker chip, `{file} · page {n}`
and a quoted snippet; more than two collapse behind `Show {n} more sources`. An
answer that used no retrieval says `Answered without your documents` in a single
muted 11px line. On the right, a dismissible 296px **Sources rail**: one card per
document with a relevance bar (`--primary` fill on a `--border` track), chunk
count and page list. Masked values render as `[PESEL]` in every snippet with the
note that originals were removed at ingestion. Message actions (Copy, Regenerate,
thumbs) appear only after the answer completes; while streaming, Send becomes Stop.

**File table** (screen 03). Columns: checkbox 28px · file name `minmax(220px,1fr)`
with a mono 9px type tag · size 76px right tabular · added 128px tabular
(`6 Sep, 12:54`) · status 108px badge · PII policy 168px quiet 24px select · row
menu 32px. Rows 34px, header 30px with display-font uppercase labels, row rules in
`paper-100` (not `--border`) so the grid reads without ruling every cell. The row
grid carries `min-width: 840px` inside an `overflow-x: auto` wrapper — the name
column never collapses; below 840px the table scrolls rather than squeezing. A
selection bar appears above the header when anything is checked. Filters are chips
showing their value (`Status: Processing`) with an `×`, plus `Clear all`.

---

## New components to build

Both are new primitives; everything else uses existing shadcn parts.

**`StatusBadge`** (`components/ui/status-badge.tsx`) — the single vocabulary for
document and job state, replacing every ad-hoc pill in the app. Four states:
`ready` (ready-tint fill, `oklch(0.42 0.11 152)` text), `processing`
(pending-tint fill, `oklch(0.48 0.11 70)` text, optional determinate percentage
as the label), `failed` (`crimson-50` / `crimson-700`), `queued` (`--muted`).
Height 20px, radius 4px, 11px medium label, 5px leading dot, always a word or a
percentage.

**Active-nav marker** — either a `MarkerNavItem` or an extension of the existing
sidebar button. Active state is exactly `bg-accent text-accent-foreground
font-medium` plus `shadow-[inset_2px_0_0_var(--marker)]`. Used by the sidebar, the
knowledge-base scope rail, the settings rail, and as `inset 0 -2px 0` for the
active tab underline on the Members tabs.

## Interactions & behaviour

- **Hover**: rows and ghost controls take `--accent` fill with
  `--accent-foreground` text. Outline controls move their border to `brand-300`
  and their text to `brand-700`. Cards take `border-color: brand-300` plus the
  accent fill.
- **Pressed**: one ramp step past the base — `brand-700` on a light ground.
- **Destructive outline buttons** invert on hover: crimson fill, white text.
- **Transitions**: 120ms on colour and border, `ease-out`. Nothing animates size
  or position on hover.
- **Streaming**: caret while the answer streams; Send becomes Stop; message
  actions mount only on completion.
- **Loading**: skeleton rows at the real row height for tables and lists — never
  a centred spinner in a full pane.
- **Empty states**: two lines and one action, top-aligned, no illustration.
- **Errors**: what happened, then what to do — "Upload failed — file is over the
  50 MB limit. Split it or compress it and try again."
- **Saving**: preference changes save on change with no Save button; credential
  and destructive changes keep an explicit action and a confirmation.
- **Responsive**: the panel is a desktop tool. The content column caps at 1120px
  (620px for settings forms). Below 1100px the sources rail collapses to a toggle;
  below 900px the sidebar collapses to icons and the file table scrolls
  horizontally. Card grids step 4-up → 3-up → 2-up → 1-up via
  `repeat(auto-fit, minmax(230px, 1fr))`.

## State

Nothing here needs new global state beyond what the app has. Three pieces of
per-user UI state to persist:

- Sources rail open/closed (per user, restored on load).
- Sidebar collapsed/expanded.
- Appearance: light / dark / system (already present).

Retrieval metadata — chunk count, latency, per-document relevance scores and page
numbers — has to reach the client for the retrieval row and the sources rail. If
the current chat response payload does not carry it, that is an API change and
belongs in phase 6.

## Assets

- `brand/ragen-mark-navy.svg`, `ragen-mark-white.svg` — the mark (R + chevron).
  In the prototypes it is inlined as three stroked paths at `viewBox="0 0 84 64"`;
  stroke `#1c244b` for the R and the leg, `#cc1d3e` for the chevron. On dark
  grounds use white with a `crimson-400` chevron.
- `brand/ragen-inline-navy.svg`, `ragen-inline-white.svg` — the horizontal
  logotype, for the login and marketing surfaces rather than the panel chrome.
- `brand/ragen-tile-ai-navy.svg`, `ragen-tile-ai-white.svg` — **the current app
  logo**: the mark in a rounded tile, then `Ragen.ai` beside it, the `.ai` in
  crimson. Navy on light grounds, white on dark. These two are what
  `apps/web/public/assets/` and the docs site serve, so a change here is a
  change to the product. `ragen-tile-ai-mono-white.svg` and `-mono-black.svg`
  are the single-colour cuts, for print and for anywhere the two-colour lockup
  cannot survive. The copies in this folder keep their C2PA manifests; the
  shipped copies have them stripped, because those load on every page.
- Icons: Lucide, already a dependency (`iconLibrary: lucide` in `components.json`).
- Fonts: Inter and Barlow Condensed via `next/font/google`; JetBrains Mono the
  same, or the system mono stack if you would rather not add a third file.
- No photography anywhere in the panel.

## Files in this bundle

```
IMPLEMENTATION_BRIEF.md   The working plan — 8 phases, acceptance checks. Start here.
UX_RULES.md               26 rules for AGENTS.md.
ragen-tokens.css          The token layer. Lands in the repo verbatim.
README.md                 This file.
screenshots/              The eight authoritative visual targets (1440px @2×).
reference/                The HTML design references — read, do not copy.
  Ragen Panel Screens.dc.html    All eight screens.
  Ragen Design System.dc.html    Palette, type, density, components, rules.
  support.js                     Runtime the two files need to open in a browser.
brand/                    Logo SVGs.
```

## Repo targets

| Concern | File |
| --- | --- |
| Tokens | `apps/web/src/app/[locale]/global.css` |
| Font loading | `apps/web/src/app/[locale]/layout.tsx` |
| Primitives | `apps/web/src/components/ui/{button,card,input,badge}.tsx` |
| shadcn config | `components.json` (`style: new-york`, `baseColor: neutral`, lucide) |
| Answer rendering | `apps/web/src/app/components/Assistant/ChatOutput/` |
| Settings routes | `docs/settings-pages.md` |
| Retrieval + masking behaviour | `docs/rag-pipeline.md`, `docs/security-and-privacy.md` |
| Panel width escape hatch | `.panel-content-wrapper:has([data-panel-fullwidth])` in `global.css` |
