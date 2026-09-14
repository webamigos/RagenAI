# Prisma (v7)

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte
`project_doc_max_bytes` budget — content past that offset is silently dropped.
Reached from that file's Architecture section.

Uses `@prisma/adapter-pg`. Config `prisma.config.ts` (excluded from tsconfig), schema `prisma/schema.prisma`, client singleton `src/libs/db/index.ts` (aliased `@ragenai/prisma-client`), generated into `src/generated/prisma/` (gitignored, `npm run generate:types`).

`prisma/schema.prisma` is the **single shared schema for the whole monorepo**: each app gets its own client from a `generator` block in that one file, and one `prisma generate` at the root regenerates all of them. Do not create a separate schema for another app — add another `generator` block here instead. Why, and which block belongs to which app: [ADR-21](docs/adrs/21-monorepo-and-api-decoupling.md).

Import `PrismaClient`, enums and types from `@/generated/prisma/client` in **server** code; a client component imports `@/generated/prisma/browser`. No build step rewrites the server import to the browser one — a `webpack` block claimed to and never ran; `tests/architecture/client-bundles-stay-browser-safe.test.ts` catches a mistake.

**Tenant-scope guard (warn-only)**: a Prisma Client Extension that **warns, it
does not throw**, and does not cover models scoped through a relation — not a
substitute for getting the `where` clause right. Model map in
`@ragenai/platform-contracts` (ADR-33); detail in
[`docs/tenant-scope-guard.md`](docs/tenant-scope-guard.md).
