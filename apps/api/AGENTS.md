# apps/api — AGENTS.md

NestJS 11 public API (`v1` prefix, port 3001), same Postgres as apps/web. The
root `AGENTS.md` and `docs/lessons.md` apply here too. **Read
[`docs/agent-guide.md`](docs/agent-guide.md) before nontrivial work** — this
file holds only the rules, because Codex reads it and the root file under one
32 KiB budget.

```bash
npm run start:dev          # watch mode
npm test                   # Vitest (SWC — Nest needs decorator metadata)
npx vitest run <path>      # one file
npm run api:build          # from the root — the root tsc does NOT cover apps/api
```

- **ESM, `nodenext`**: local imports carry `.js`; `require()` typechecks and
  then throws at runtime, specs included. A CJS dependency may need
  `import pkg from 'x'; const { Thing } = pkg;`.
- **OTel needs `--import @opentelemetry/instrumentation/hook.mjs`** or it
  traces nothing, silently. `src/instrument.ts` stays the first import.
- **No local Prisma schema** — edit the root `prisma/schema.prisma`; import the
  client from `src/generated/prisma`, inject `PrismaService`.
- **The ported RAG libs are copies of apps/web's** — the repo's most-repeated
  bug source. A fix in apps/web's `src/` almost always needs the same edit here
  ([`docs/ported-libs.md`](docs/ported-libs.md)).
- **Auth**: `ApiKeyGuard` (opaque `sk-` keys, secret checked in the vault),
  `SessionAuthGuard` (apps/web-issued HMAC token, never a cookie),
  `WorkerSecretGuard`, `McpServiceGuard`. Timing-safe comparisons only. Org
  context comes from `@GetApiContext()` / `@GetSessionAuthContext()`, never
  from the request body.
- **Every throttled route is counted by exactly one tier** — name it with
  `@Throttle({ cheap | expensive })`, or it is `default`.
- Before adding a module or provider: [`docs/modules.md`](docs/modules.md).
- Vitest specs: `vi.hoisted` for anything a `vi.mock` factory closes over; a
  mocked constructor is a `function`/`class`, never an arrow.
