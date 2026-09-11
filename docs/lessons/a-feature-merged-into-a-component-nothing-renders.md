---
title: A feature merged into a component nothing renders is invisible, and every test still passes
modules: [web]
areas: [architecture, testing]
topics: [dead-code, react, component-tests, false-green, rag, citations]
---

## Context

Gap 2 stage 1 added `SourcesBlock` — the panel under an assistant answer
saying which documents the turn retrieved and which of them the answer cited.
It was wired into `apps/web/src/app/components/Assistant/ChatOutput/MessageItem.tsx`,
came with a component test, passed `npm run verify`, and merged as #1027.

Three later pull requests built on it: relevance scores per source (#1034),
persisted snippets (#1035), and prompted `[n]` citation markers (#1042). Each
one measured its own change, each one was reviewed, and each one merged green.

## Problem

Nothing imports `MessageItem`. The chat screens mount `ChatOutput`, which has
its own message loop and never referenced it. The component had been left
behind by an earlier refactor.

So the retrieval was streamed from the server, reduced into
`retrievalByMessage`, and read by exactly one consumer that is not on any
page. `attributableCitations` had exactly one caller, also there. For three
PRs the feature existed end to end in the code and was not on screen once.

Nothing in the toolchain says so:

- **Typecheck cannot.** An unimported module is still a valid module.
- **Lint cannot.** `no-unused-vars` is scoped to a file; a file nobody imports
  has no unused anything.
- **The component test cannot.** It renders `SourcesBlock` directly. That is
  the correct way to test a component and it is exactly why it passed —
  mounting it in a test is not evidence that anything else mounts it.
- **Coverage cannot.** The component and its test are both covered.

The bug is a missing *edge* in the render graph, and every one of those tools
looks at nodes.

## Recurrence (#1035, the server half)

It happened a second time in the same feature, one layer down. #1035 —
"a reopened thread still quotes its sources" — added the `snippet` column,
wrote the rows, and taught `getThreadMessagesQuery` to select
`documentRetrievals` and decrypt them. It touched no UI file at all.

`AssistantAnswer` reads retrieval from `state.assistant.retrievalByMessage`,
which only the SSE stream fills and `clearMessages` empties on navigation. So
the rows were fetched, decrypted at KMS cost, serialized to the client and
dropped on the floor; a reopened thread still rendered its `[n]` as bare text
and no sources block, exactly as before the PR. `grep -rn documentRetrievals
apps/web/src` returned the query and nothing else for a day.

Same blind spot, different edge. Last time the missing edge was an import;
this time it was a field nobody selected out the other end. Both are green
under typecheck, lint, coverage and every component test, because both are
edges and all four tools look at nodes.

## Rule

**When a change is only worth anything on screen, one of its tests must go
through the component the screen actually mounts.** Not the unit under test,
not its immediate parent — the one a page renders. If that test is hard to
write, that difficulty is information about the component, not a reason to
skip it.

Three cheap checks alongside it:

- Before building on an existing surface, grep for who imports it. `grep -rn
  "<ComponentName>" apps/*/src` taking less than a minute would have caught
  this before #1034 rather than after #1042.
- A second component that renders the same thing is not redundancy, it is a
  coin flip. Delete the unreachable one rather than repairing it, so the next
  change has one candidate instead of two.
- After widening a query, grep for the new field's *readers*, not its writers.
  A `select` with no consumer is the server-side spelling of an unimported
  component, and it costs more than dead code: #1035's snippets were decrypted
  on every thread load for a renderer that did not exist.

## Applies to

`apps/web` components, and anything else where the wiring between a feature
and the page is by import rather than by type. The same shape appears
wherever a value is *declared* and never *read* — see
[a field name that lies outlives every comment](a-field-name-that-lies-outlives-every-comment.md)
and
[deleting a route is invisible to typecheck](deleting-a-route-is-invisible-to-typecheck.md),
which is the string-addressed version of the same blind spot.
