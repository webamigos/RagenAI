---
title: 'Better Auth reads `BETTER_AUTH_URL` by itself when `baseURL` is unset, so renaming the variable silently changes an app that never names it'
modules: ['admin', 'web', 'env']
areas: ['architecture']
topics: ['better-auth', 'environment-variables', 'app-url', 'rename', 'adr-37', 'architecture-tests']
---

# Better Auth reads `BETTER_AUTH_URL` by itself when `baseURL` is unset, so renaming the variable silently changes an app that never names it

**In short**: Renaming `BETTER_AUTH_URL` to `APP_URL` looked like a grep-and-replace — apps/admin's `auth.ts` did not mention the variable at all. But `betterAuth()` with no `baseURL` falls back to `BETTER_AUTH_URL` (then `NEXT_PUBLIC_BETTER_AUTH_URL`, `BASE_URL`, …) inside `better-auth/dist/utils/url.mjs`. A grep of this repository cannot find that read. The fix is to pass `baseURL` explicitly from `resolveAppUrl()`, so the only reader of either name is code we own.

**Context**: `docs/specs/2026-10-18-app-url-replaces-better-auth-url.md` made
`APP_URL` the public-origin variable and kept `BETTER_AUTH_URL` as a deprecated
fallback, read only in `packages/env/src/app-url.ts`.

**Problem**: A grep of the repository found every reader except one. apps/admin
had no `baseURL` in its `betterAuth()` config, so the library read the old name
itself. Had the rename stopped at the grep, an admin deployment configured with
only `APP_URL` would have run Better Auth with no base URL. It would have
derived the origin from each request and logged "Base URL is not set", while
every test passed. `tests/architecture/app-url-is-resolved-in-one-place.test.ts`
cannot see it either: the read sits in `node_modules`.

**Rule**: A library that reads an environment variable by convention is a
reader too. Before renaming or retiring a variable, grep the dependency's
`dist/` for the name, not only `src/`. Then make the library's config explicit
(`baseURL: resolveAppUrl()`) so the convention never applies.

**Applies to**: Better Auth (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`), and any
library with a documented env fallback: OTel's `OTEL_*`, Prisma's
`DATABASE_URL`, the AWS SDK's `AWS_*`.
