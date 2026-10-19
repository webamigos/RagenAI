---
title: Better Auth redirects a refused OAuth callback only when the APIError carries a code — without one the browser is left on a JSON page
modules: [web]
areas: [integration, security]
topics: [better-auth, oidc, sso, oauth-callback, error-redirect, databaseHooks, mapProfileToUser]
---

**In short**: An `APIError` thrown while Better Auth's OAuth callback creates the user becomes a redirect to the `errorCallbackURL` only if its body has a `code`; `{ message }` alone is served as JSON on `/api/auth/callback/<id>`. An `APIError` thrown from a generic-OAuth `mapProfileToUser` is not caught at all and is JSON whatever it carries. Give every refusal a `code`, and keep an after-hook on the callback that turns any remaining non-3xx `APIError` into the redirect.

## Context

Company sign-in (OIDC, `genericOAuth`) was first tried against a real Microsoft Entra tenant on 2026-10-19, with registration closed and no `OIDC_JOIN_ORGANIZATION`. The `user.create.before` hook refused the sign-up correctly — nothing was written — with `new APIError('FORBIDDEN', { message: 'Registration is disabled…' })`.

## Problem

The browser ended on `http://localhost:3000/api/auth/callback/oidc?code=…` showing `{ "message": "Registration is disabled…" }`. In better-auth 1.7 `api/routes/callback.mjs` wraps `handleOAuthUserInfo` in `catch (e) { if (isAPIError(e) && e.body?.code) redirectOnError(e.body.code, …); throw e; }` — no code, no redirect. `provider.getUserInfo()`, which calls `mapProfileToUser`, sits outside any try block, so a refusal thrown there escapes to the dispatcher as a JSON response. Every unit test passed: none of them ran the callback, and the e2e refusal case at the time went through the empty-email path, which Better Auth itself turns into `email_not_found`.

## Rule

- A refusal anywhere on an OAuth path is an `APIError` with a `code` (`refusalError()` in `src/lib/oidc-auth.ts`); the code is what the sign-in page reads from `?error=`.
- Errors Better Auth does not route itself are caught by the `oidc-callback-refusals` after-hook, which reads the `errorURL` from `getOAuthState()`. It only changes the response, never the decision.
- **An after-hook redirects by returning a `Response`, not by throwing `ctx.redirect()`.** `dispatchAuthEndpoint` serialises an after-hook's `APIError` through `toResponse(error, { status: <the endpoint's status> })`, and better-call prefers `init.status` over the error's own — so the thrown 302 left as a 403 carrying a `Location` header, which the browser does not follow. Every unit test passed; only p0-38 driving a real browser showed it.
- An e2e refusal case must go through the path that refuses — the user-create hook needs registration closed, which the seed leaves open.

## Applies to

Any Better Auth OAuth/OIDC provider, any `databaseHooks.*.before` that throws, and any `mapProfileToUser` that refuses. Re-read `callback.mjs` after a Better Auth upgrade: the `e.body?.code` condition is the whole behaviour.
