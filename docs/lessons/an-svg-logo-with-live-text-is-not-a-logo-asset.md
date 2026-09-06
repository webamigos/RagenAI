---
title: "An SVG logo that keeps its wordmark as live <text> renders in a different font for every viewer — and its viewBox is sized against the fallback"
modules: ['web', 'docs']
areas: ['frontend', 'assets']
topics: ['svg', 'branding', 'webfonts', 'next-image', 'design-handoff']
---

# An SVG logo that keeps its wordmark as live `<text>` renders in a different font for every viewer — and its viewBox is sized against the fallback

> Caught during a brand handoff and fixed before merge. That particular export was
> later superseded by a path-based one, so no file in the tree shows the problem —
> the rule is here because the next handoff can arrive the same way.

**Context**: a brand refresh arrives as a folder of SVG exports — a mark, a lockup, light and dark variants. They open correctly in a browser and in a design tool, so they look ready to drop into `apps/web/public/assets/`. One such lockup drew its wordmark as `<text font-family="Barlow Condensed, Barlow, sans-serif" font-weight="600" font-size="54">`.

**Problem**: an SVG referenced through `<img src>` — which is what `next/image` and the Docusaurus navbar logo both produce — is rendered as an *isolated document*. It cannot reach the host page's CSS, its `@font-face` rules, or any webfont the app loads. It resolves `font-family` only against fonts installed on the viewer's machine. Barlow Condensed is not a system font anywhere, so every viewer would have got some other face, at some other width, and the logo's proportions would have changed per machine. Rendered at the same height, the un-outlined export came out 540px wide against an outlined version's 422px — a 28% difference driven purely by which fonts the viewer happens to have.

The second half is subtler and easy to ship without noticing. That export's `viewBox` was `0 0 360 64`, but with the *intended* font the artwork's ink ended at x=270. The 360 had been measured against the fallback the design machine actually rendered (plain Barlow, ending at x=333) — so the file carried 90 units of dead space on the right against 11 on the left. A logo sized by height in a flex header then sits visibly left of where it should, with a gap nobody can find in the CSS, because the gap is inside the asset.

A related trap in the same files: the exports carried ~8KB of base64 C2PA provenance metadata around ~500 bytes of artwork — 94% of each file — which is meaningless once the asset is committed and served.

**Rule**: a logo shipped as a static asset must not depend on a font. Check every incoming SVG for `<text>` before anything else (`grep -c '<text\|font-family' *.svg`); if it has one, outline it to paths before committing (`fontTools` + `uharfbuzz`: shape the string with kerning on, then draw each glyph through a `TransformPen` scaled by `fontSize / unitsPerEm` with y negated). Then check the framing against the *outlined* ink rather than trusting the exported `viewBox`, and measure that ink by rasterizing and reading the alpha bbox rather than deriving it from the path data — a `stroke-linejoin="miter"` tip reaches well past the coordinates in the `d` attribute (x=79.1 where `72 + stroke-width/2` predicted 77, which clipped the icon until it was measured). Strip C2PA metadata while you are there. Finally, treat a logo's aspect ratio as a layout input: it silently rescales every `<Logo className="h-*">` site, and breaks any hardcoded `width`/`height` pair, such as the one in the email header.

**Applies to**: any brand or icon asset added under `apps/web/public/assets/`, `apps/docs/static/img/`, or the Next.js metadata icons in `apps/web/src/app/`; and any design handoff of SVGs that contain a `<text>` element.
