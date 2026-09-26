---
title: "A findBy query resolves on the commit, not on the effects that follow it — a scroll spy read right after it is a race"
modules: ['web']
areas: ['testing']
topics: ['vitest', 'react-testing-library', 'react', 'passive-effects', 'flaky-tests', 'false-red', 'scrollIntoView']
---

# A findBy query resolves on the commit, not on the effects that follow it

**Context**: `passage-highlight.test.tsx > XlsxViewer > opens on the sheet the
rows came from, marks them, and scrolls past the header` failed twice in
`npm run verify` on 2026-09-25/26, on two branches that touched neither the
viewer nor its test (an apps/api change and a rag-core change). Both failures
were the same line: `expected undefined to be <tr data-cited-row …>` — the
scroll spy had not been called. Run alone, under ten CPU-burning processes, 60
repeats in a row, it passed every time; a full `turbo run test` rerun passed.

**Problem**: the test awaited `findByText('Exchange')` and then read
`scrollSpy.mock.contexts[0]`. `XlsxViewer` marks the cited rows in the render
that shows them, but scrolls to them in a `useEffect`. The workbook arrives in a
`fetch().then()` outside `act`, so React commits the DOM and runs the passive
effect in a later scheduler task. `findByText` resolves on the DOM mutation —
the commit — so the assertions run between the commit and the effect whenever
the scheduler's task lands after `waitFor`'s check. That ordering is what a
loaded full run changes, which is why isolation, even under CPU load, never
reproduced it.

The other viewers in the same file did not have the problem only by accident
of structure: they insert `<mark>` *in* the effect that scrolls, so waiting for
the mark waits for the scroll. `PdfViewer.test.tsx` already did it right —
`await waitFor(() => expect(scrollSpy).toHaveBeenCalled())`.

Reproduced deterministically instead of by luck: delaying the viewer's scroll
by 30 ms (`setTimeout`) makes the old test fail every time, on exactly the CI
assertion, and the fixed test pass.

**Rule**: anything a component does in an effect — a scroll, a focus, an
analytics call, a second fetch — is not done when a `findBy*` resolves. Wait
for *that* observable (`await waitFor(() => expect(spy).toHaveBeenCalled())`),
not for the DOM it follows. To tell a race from a real regression, make the gap
wide on purpose (a temporary delay in the effect) rather than hoping load
reproduces it.

**Applies to**: every React Testing Library test that asserts on a side effect
after awaiting DOM — scroll and focus spies especially, since jsdom has no
layout and the spy is the only observable.
