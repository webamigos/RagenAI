---
title: 'Deleting a route is invisible to typecheck, because a route is addressed by string and not by symbol'
modules: ['web']
areas: ['testing', 'architecture']
topics: ['e2e', 'playwright', 'next-app-router', 'dead-code', 'refactoring']
---

# Deleting a route is invisible to typecheck, because a route is addressed by string and not by symbol

**Context**: removing the in-app support feature meant deleting the whole
chain — the floating button, the modal, the wizard, `/support`, the client
call, `/api/send`, the mailer function and two email templates. Each link was
traced to its callers first, `npm run verify` passed, and the PR opened green
on lint, typecheck, test and build.

**Problem**: `test-e2e` failed. `apps/web/e2e/smoke-07-pages.spec.ts` still
navigated to the deleted page:

```ts
await page.goto(ROUTES.support); // ROUTES.support = '/pl/support'
await expect(page).toHaveURL(/support/);
await expect(page.getByText(/jak możemy pomóc/i).first()).toBeVisible();
```

The interesting part is why nothing earlier caught it. `apps/web/e2e` **is**
compiled — the web `tsconfig.json` includes `**/*.ts`. But the reference is a
**string**. `ROUTES.support = '/pl/support'` type-checks perfectly whether or
not a page exists at that path, because App Router resolves routes from the
filesystem at request time and nothing links the literal to the file. Deleting
`page.tsx` removes no symbol that anything imported, so there is no type error
to raise. The same holds for `fetch('/api/send')`, for a `<Link href="...">`
written as a literal, and for any redirect target.

Grep is the tool here, and grep is only as good as the paths you give it. The
first sweep covered `apps/web/src`, `e2e/` and `apps/admin/e2e` — and the web
specs live in `apps/web/e2e`, so it returned nothing and read as clean. An
empty result from the wrong path looks exactly like an empty result from the
right one.

A second spec, `p1-support-wizard.spec.ts`, referenced the feature too and
would **not** have failed the PR: CI runs `npx playwright test '(smoke|p0)-'`
on pull requests. Had the smoke test not existed, this merges green and breaks
the nightly instead — see
[flipping a feature default broke specs in a tier that never gates a PR](flipping-a-feature-default-broke-specs-in-a-tier-that-never-gates-a-pr.md).

**Rule**: when deleting a route, an API path or a page, the compiler is not a
participant — search for the **string**, not the symbol, and search the whole
repository rather than the directories you expect. `apps/web/e2e`,
`apps/admin/e2e`, `docs/`, `.env.example` and the workflow files all address
things by name and none of them typecheck against reality. Sweep with the
literal path and every symbol removed alongside it, then read what the sweep
skipped:

```bash
grep -rn "/support" . --exclude-dir={node_modules,.next,.git,coverage,generated}
```

Expect incidental substrings in the result (`SUPPORTED_MIME_TYPES` matched
`/supportedMimeTypes` here) and read them rather than counting them. And when
a sweep comes back empty, confirm the path you swept actually contains the
files you meant — a clean result is worth nothing until you know the search
looked in the right place.

**Applies to**: any route, API path or public URL removed from `apps/web` or
`apps/admin`. Also to renaming one, which is the same defect with a longer
fuse: the old string keeps compiling and starts 404ing.
