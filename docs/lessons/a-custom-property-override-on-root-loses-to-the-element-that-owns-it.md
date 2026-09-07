---
title: 'A custom-property override on :root loses to the element that already owns the property, so the declaration renders nothing and nothing warns you'
modules: ['docs', 'web']
areas: ['frontend']
topics:
  [
    'css-custom-properties',
    'specificity',
    'docusaurus',
    'infima',
    'tailwind',
    'design-tokens',
    'dead-code',
  ]
---

# A custom-property override on `:root` loses to the element that already owns the property, so the declaration renders nothing and nothing warns you

**Context**: aligning `apps/docs` with the brand palette that
`ragen-website` defines in `src/config/brand.ts`. The existing
`apps/docs/src/css/custom.css` looked like a normal theme override — a `:root`
block naming the brand colours, and a `[data-theme="dark"]` block naming the
dark ones. Swapping the hex values in place looked like the whole job.

**Problem**: three of those declarations had never rendered, and the
stylesheet gave no hint of it. The footer read `#252d53` in `:root`, but
`footer: { style: 'dark' }` in `docusaurus.config.ts` puts `.footer--dark` on
the `<footer>` element, and Infima's rule for that class assigns
`--ifm-footer-background-color` **on that element**. A custom property set on
the element beats one inherited from `:root` regardless of source order, so
the footer had been Infima's grey `#303846` the whole time. Likewise
`--ifm-background-color: #0f1117` and `--ifm-background-surface-color` were
written under `[data-theme="dark"]` (specificity 0,1,0) while theme-classic
sets them under `html[data-theme="dark"]` (0,1,1) — the more specific selector
wins no matter how late `custom.css` loads, so the dark theme had been
Infima's `#1b1b1d`/`#242526`. Every one of these is a plausible-looking line
in a file whose other declarations work, and the build is green either way.

Both failure modes are invisible to every check the repo runs: a colour token
is a string, so typecheck and lint have nothing to say, the Docusaurus build
succeeds, and an e2e assertion on a class name still passes. Reading the
declaration is not evidence that it paints.

**Rule**: after retokenising colours, verify against the **rendered** page,
not the source — read the resolved value with
`getComputedStyle(el).getPropertyValue('--token')` and compare it to what you
wrote. If it differs, enumerate the competing rules
(`document.styleSheets` → the rules that set that property) instead of nudging
the value; the answer is almost always that some element or a more specific
selector already owns the property. Then fix the **selector**, not the value:
set the property on the element that owns it (`.footer { --ifm-footer-…: … }`)
or match the framework's specificity (`html[data-theme="dark"]`). The same
shape of check caught real risk twice before in this repo — confirming
`.bg-brand-600` is actually emitted after a Tailwind class rename, and
confirming an `@theme` edit reaches the utilities that use it. Colour work is
the one area where "the code says so" is worth the least.

**Applies to**: `apps/docs/src/css/custom.css` (every Infima/theme-classic
token it overrides), and any `@theme`/`:root` token edit in
`apps/web/src/app/[locale]/global.css` — which carries the same trap in a
different form, with two `:root` blocks where the unlayered one silently beats
the one inside `@layer base`.
