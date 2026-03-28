# ADR-03: Prisma v7 Migration & camelCase Schema

**Status:** Accepted
**Date:** 2026-02-01

## Context

The application used Prisma v5.10.2 with snake_case field names matching the database columns directly. Prisma v7 introduced the PostgreSQL adapter pattern (`@prisma/adapter-pg`) and improved TypeScript support, but required TypeScript ~5.7.

## Decision

Migrate to Prisma v7.3.0 with the following changes:

- **Adapter pattern** — use `@prisma/adapter-pg` instead of the built-in Prisma engine connection
- **Generated client** — output to `src/generated/prisma/` (gitignored), import from `@/generated/prisma/client`
- **camelCase schema** — all Prisma model fields use camelCase with `@map('snake_case')` for DB column mapping
- **Schema reset** — collapsed all migrations into a single `0_init` migration
- **TypeScript upgrade** — from ~5.3 to ~5.7 (required by Prisma v7)
- **Config isolation** — `prisma.config.ts` excluded from tsconfig (processed by Prisma CLI directly)

## Consequences

- Codebase uses idiomatic TypeScript camelCase everywhere (no more `user.organization_id`)
- `@prisma/adapter-pg` must be in `serverExternalPackages` to prevent pg/dns leaking to client bundle
- Meilisearch metadata keys remain snake_case (external system, not governed by Prisma)
- Browser-safe imports auto-redirected via webpack: `@/generated/prisma/client` → `@/generated/prisma/browser` in client components
