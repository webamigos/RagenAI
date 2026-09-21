---
title: '`Agent.close()` waits for the response body, so closing a guarded dispatcher before the caller reads it hangs on anything bigger than the socket buffer'
modules: ['web', 'api']
areas: ['integration']
topics: ['undici', 'fetch', 'ssrf', 'connector-guard', 'backpressure', 'streaming', 'fail-silent']
---

# Closing a dispatcher waits for a body nobody is reading yet

**Context**: `createGuardedFetch` (`packages/connector-guard`) hands out a
`fetch` bound to its own undici `Agent`, plus a `close()` — the dispatcher owns
sockets, so a call that does not close it leaks one. `fetchWithTimeout`, in
both `apps/web` and `apps/api`, therefore did the obvious thing:

```ts
try {
  return await send(url, { ...fetchOptions, signal: controller.signal });
} finally {
  clearTimeout(timeoutId);
  await guarded?.close();
}
```

**Problem**: `fetch` resolves at the **headers**. The body is still on the wire
when `finally` runs, and `Agent.close()` is the *graceful* close — it waits for
every in-flight request to finish, which a request cannot do while its body
sits unread behind backpressure. Nobody can read it, because the caller has not
received the `Response` yet: the `return` is waiting on the `finally`.

Measured against undici 7.29 with a local server and a real `Agent`: a 1 MB
body never resolves `close()`, a 16 KB one resolves immediately. That is the
whole reason it never fired — the two callers are API-key registration POSTs
that read a small JSON object, so the body always fitted in the first read and
the request completed before `close()` asked. A verbose upstream, a proxy's
error page or an HTML 502 is all it takes to cross the line, and the failure
mode is not an error: the Server Action hangs, past its own `clearTimeout`, and
`timeoutMs` no longer applies.

Neither unit suite could have caught it — both mock `createGuardedFetch`
entirely, so `close()` was a spy that resolved whatever the body was doing.

**Rule**: a dispatcher you own outlives the `fetch` that resolved. Read the
body before closing it (`bufferBody` returns a fresh `Response` carrying the
bytes, keeping `Promise<Response>` for the callers), or hand the caller a
`Response` whose body closes the dispatcher when it reaches EOF. Do not `await`
a graceful close on the way out of a function that returns a streaming object.
Pin the order in a test — assert `bodyUsed` on the upstream response at the
moment `close()` is called — because mocking the guard hides the real
lifecycle.

**Applies to**: `apps/web/src/features/connectors/utils/fetch-with-timeout.ts`
and its `apps/api/src/connectors/fetch-with-timeout.ts` copy (ADR-21: fix both,
always); anything else that gives a `createGuardedFetch` dispatcher a lifetime
shorter than the response it produced.
