---
title: 'React rewrites `dangerouslySetInnerHTML` on every re-render, so marks added to that DOM vanish the moment the component updates'
modules: ['web']
areas: ['frontend']
topics: ['react', 'dangerously-set-inner-html', 'dom-mutation', 'citations', 'highlighting', 'false-green']
---

# React rewrites `dangerouslySetInnerHTML` on every re-render, so marks added to that DOM vanish the moment the component updates

**Context**: Citation highlighting marks the cited passage inside the DOCX
viewer by wrapping text nodes of mammoth's HTML in `<mark>` after it renders
(`DocumentPreview/passage/highlight-in-element.ts`). The HTML itself is set with
`dangerouslySetInnerHTML={{ __html: html }}`, and the highlight hook then sets a
"found" state so the viewer can hide the not-found hint.

**Problem**: The marks appeared and were gone a tick later, with the HTML string
unchanged. React 19 decides whether to touch a prop by comparing the *prop
value*, and `{ __html: html }` is a new object on every render — so the "found"
re-render wrote `innerHTML` again (`react-dom-client`'s `setProp`, case
`dangerouslySetInnerHTML`, assigns `domElement.innerHTML` unconditionally). The
effect that added the marks did not re-run, because none of its dependencies had
changed, so nothing put them back. The test found it only because it asserted
the marks' text *after* waiting for them to exist; a test that stopped at "a
mark appeared" passes against the broken version.

**Rule**: DOM you mutate after React renders it must be a subtree React will not
reconcile again. Memoise the element (`useMemo(() => <div ref={…}
dangerouslySetInnerHTML={…} />, [html])`) so a re-render hands React the same
element and it skips the subtree, or set the HTML imperatively in an effect. The
same applies to React-rendered children you split with `Range.surroundContents`
(the Markdown viewer): memoising keeps a state change elsewhere in the component
from reconciling them. When testing such a component, assert on the mutated DOM
after a state change has had the chance to re-render it.

**Applies to**: any viewer or widget that decorates rendered HTML after the fact
— highlights, anchors, syntax colouring, link rewriting — in `apps/web`, and in
particular anything combining `dangerouslySetInnerHTML` with local state.
