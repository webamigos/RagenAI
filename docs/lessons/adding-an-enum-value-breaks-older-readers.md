---
title: 'Adding a Postgres enum value is not backwards-compatible — an older Prisma client throws when it reads a row containing it'
modules: ['web', 'api', 'admin', 'worker']
areas: ['architecture', 'deployment']
topics: ['prisma', 'migrations', 'enums', 'rolling-deploy', 'postgres']
---

# Adding a Postgres enum value is not backwards-compatible — an older Prisma client throws when it reads a row containing it

**Context**: two migrations in this repository add a member to
`SecurityEventType`, and both carry the same reassurance:

> Adding an enum value is non-breaking: existing rows are untouched and older
> application versions never produce it.

The first half is true. The second is true and irrelevant, because the danger
is not writing the value — it is **reading** it.

**Problem**: Prisma validates enum values on the way *out* as well as in. A
client generated before the member exists throws when a query returns a row
that carries it:

```
Value 'AUTH_ADMIN_ROLE_REVOKED' not found in enum 'SecurityEventType'
```

Measured, not assumed: generating a client from a schema with the member
removed, then reading a row written with it, fails exactly that way. A plain
`findUnique` is enough — no filter on the enum is needed, only a row that
contains it.

That matters here because this monorepo has **three separately generated
clients** reading `security_events` — apps/web's, apps/admin's (which uses
apps/web's), and apps/api's own `apiClient` block — and the services deploy as
separate Railway services rather than atomically. So the hazardous window is
real: migration applied and the writer deployed, while some reader still runs
the previous build. In that window apps/web's incidents list and apps/api's
security-event counts throw on any page of results containing one new row.

The failure is also confusing in production: it presents as a 500 from a
listing endpoint, not as anything mentioning migrations or deployment order.

**Rule**: adding an enum value is a two-step change, not a one-step one.
Release the migration together with regenerated clients for **every** reader
first; only start writing the new value once those are deployed. Where writer
and readers cannot be separated by a release, accept that the window exists and
keep it short — do not reason about it from "older versions never produce it",
which is the wrong half of the problem.

Two smaller notes from the same change:

- `ALTER TYPE … ADD VALUE` appends to the end of the Postgres enum, so the
  database's ordering will not match `schema.prisma`'s. That is cosmetic here:
  `prisma migrate status` reports no drift and nothing in this codebase sorts
  or compares by an enum's position. Do not "fix" it by editing the migration
  after it has been applied — Prisma checksums migration files and will refuse
  to run against any database that already has the old one.
- Hand-writing a subset union of an enum (as `apps/admin/src/lib/audit.ts`
  does, to constrain which event types an admin action may raise) is already
  type-safe without deriving it from the generated enum: the union is passed to
  `prisma.securityEvent.create`, so a member that does not exist fails
  typecheck there, and with a better message than `Extract<…>` would give.

**Applies to**: every `enum` in `prisma/schema.prisma`, and most sharply to
those read by more than one app — `SecurityEventType`, `McpConnectorStatus`,
`AiUsageStep`. Also to any enum value added while a `prisma generate` output is
committed per app rather than shared.
