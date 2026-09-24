---
title: "`typeof window` is already true while React hydrates, so a server-only branch mismatches whenever client state arrives early"
modules: [web]
areas: [frontend]
topics: [hydration, react-19, better-auth, useSyncExternalStore, ssr, race, error-418, testing]
---

## Context

A screenshot pass over the Nordwind demo logged minified React error #418 on
the knowledge base, the Brain pages and a thread page, but not on every load.
Every panel page renders through `PanelLayoutWrapper`, which returned an empty
placeholder `div` when `typeof window === 'undefined'`, or when the session had
not loaded, and the full sidebar shell otherwise.

## Problem

The branch assumed that the first client render looks like the server's. It
does not. `typeof window` is `true` from the first client render, *including the
one React compares against the server's HTML*. Better Auth's `useSession` reads
a store through `useSyncExternalStore(subscribe, get, get)`, so its hydration
snapshot is whatever the client store holds right then. `GlobalSearchDialog`,
in the root layout, subscribes to that store and starts the session fetch as
soon as the root hydrates. On a page with a slow streamed segment (a
`loading.tsx` boundary, a heavy server query), the session resolves first. The
panel then hydrates with `isSignedIn: true` and renders the shell over the
server's placeholder: #418.

It is a race, which is why it showed only on the slower pages and only
sometimes. It also hid a second fact: because the server always sent the
placeholder, no panel content was ever server-rendered, so every date
formatter below it was invisible to hydration.

## Rule

- A branch that must match the server during hydration needs a value that is
  *false during hydration*, not one that is false on the server. Use
  `useSyncExternalStore(subscribe, () => true, () => false)`: React uses the
  server snapshot for the hydrating render and the client snapshot after it.
  `useEffect` + `useState` works too, but costs an extra render everywhere.
- A client store read through `useSyncExternalStore` without a real server
  snapshot (Better Auth's `get, get`) hydrates with whatever the client has, so
  anything derived from it can differ from the server's render.
- Test hydration by hydrating. `renderToString` with `window` hidden, then
  `hydrateRoot` into that HTML with an `onRecoverableError` spy.
  `PanelLayoutWrapper.hydration.test.tsx` fails on the old branch and passes on
  the new one; a render-only test passes on both.

## Applies to

Any client component under `app/[locale]/` that branches on `typeof window`,
on `localStorage`, or on a client store during render. The next candidates are
`SidebarLayout`'s `localStorage` read in a `useState` initializer and the
date-fns `format()` calls in `ChatOutput`/`FileCard`. They are safe today only
because the placeholder means nothing below it is server-rendered.
