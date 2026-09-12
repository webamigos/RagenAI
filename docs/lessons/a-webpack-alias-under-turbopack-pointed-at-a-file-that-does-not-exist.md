---
title: 'A dependency plus a config entry naming it is not evidence the feature works — the pdfjs alias points at a file that has not existed since the package went ESM, in a webpack block Turbopack never reads'
modules: ['web']
areas: ['frontend', 'architecture']
topics: ['react-pdf', 'pdfjs-dist', 'next-config', 'turbopack', 'npm-workspaces', 'hoisting', 'dead-config', 'test-coverage']
---

# A dependency plus a config entry naming it is not evidence the feature works

**Context**: scoping a citation-highlighting feature that needs to draw over a
rendered PDF page. The document route's viewer is a plain `<iframe>` to the
browser's PDF plugin, which cannot be drawn on, so the question was how much a
real renderer would cost. The answer looked like "nothing": `react-pdf@10.4.1`
is already in the root `package.json`,
`ManageKnowledge/DocumentPreview/viewers/PdfViewer.tsx` already renders pages
with `<Document>`/`<Page>` plus paging and zoom, and `next.config.ts` already
carries a `pdfjs-dist` alias with the comment "PDF.js worker alias for
react-pdf". Three independent signals that someone had wired this up.

**Problem**: all three are inert, for three unrelated reasons.

1. The alias resolves
   `path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.js')` from
   `apps/web`. In this npm-workspaces repo `pdfjs-dist` is **hoisted to the root**
   `node_modules`, so nothing exists at that path.
2. The file name is gone regardless of location. `pdfjs-dist@5.4.296` ships
   **only `.mjs`** — `build/` and `legacy/build/` contain `pdf.mjs`,
   `pdf.min.mjs`, `pdf.worker.mjs` and friends. There is no `pdf.js` anywhere in
   the package, at either path.
3. The alias lives in a `webpack:` block, while `apps/web` runs bare `next dev`
   and `next build` on Next 16 — where Turbopack is the bundler. The block is
   not the configuration in play for dev at all.

And nothing would have told us: `DocumentPreview/__tests__/viewers.test.tsx`
mocks `mammoth` and `dompurify` and **never imports `PdfViewer`**, so no test
renders the component. A spec draft had already claimed "no new dependency, no
build configuration" on the strength of those three signals, and that estimate
was the load-bearing input to a phase plan.

**Rule**: a package in `package.json` plus a config entry naming it is evidence
that someone _intended_ the wiring, not that it works. Before costing work on it,
check three things that fail independently and silently: that the aliased path
exists **from the directory that resolves it** — hoisting moves packages out of
an app's own `node_modules`; that the file name still exists **in the installed
version** — a package going ESM-only renames every entry point without renaming
itself; and that the bundler reading that config block is **the one actually
running** — a `webpack:` block is dead config under Turbopack. Then grep the
component's test file for its own import: a viewer with no test is not "covered
by the app".

**Applies to**: `apps/web/next.config.ts`'s `webpack:` block generally, any path
built as `__dirname + 'node_modules/…'` in an npm-workspaces app, and
`DocumentPreview/viewers/PdfViewer.tsx` specifically — treat it as unproven until
something renders it. Related in shape to
[a feature merged into a component nothing renders](a-feature-merged-into-a-component-nothing-renders.md)
and [a path glob that matches nothing](path-filters-fail-open-after-a-directory-move.md):
configuration that names a thing that is not there does not fail, it does nothing.
