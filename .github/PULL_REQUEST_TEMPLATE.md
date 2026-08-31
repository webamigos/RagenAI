<!-- PRs target `dev`. See CONTRIBUTING.md. -->

## What and why

What changed, and what problem it solves. If there's an issue, link it with
`Fixes #123`.

## How it was verified

What you actually ran, and what it said. Screenshots for UI changes.

## Checklist

- [ ] Targets `dev`
- [ ] `npx tsc --noEmit -p .` passes
- [ ] `npm run lint` passes
- [ ] `npx vitest run` passes
- [ ] Tests added or updated for the changed behaviour
- [ ] **If this touches anything ported into `apps/api`** (RAG engine, vector
      store, connectors, crypto, storage, tenant-scope guard): the same edit is
      applied in both copies, and `npm run api:build` passes.
      Root `tsc -p .` does not cover `apps/api`.
- [ ] **If this touches a Prisma query on a tenant-scoped model:** it is scoped
      by `organizationId`, and `orgId` comes from the session — never from the
      client (ADR-23)
- [ ] **If this adds user-facing strings:** keys added to both
      `src/app/messages/en.json` and `pl.json`, no hard-coded text
- [ ] **If this changes `prisma/schema.prisma`:** a migration is included, and
      `npm run generate:types` was run
- [ ] Docs updated where the change makes them wrong (README, CLAUDE.md, ADRs)
- [ ] A new ADR added, or an existing one updated, if this is an architectural
      decision
- [ ] A lesson added to `docs/lessons.md` if this fixes a non-obvious gotcha
