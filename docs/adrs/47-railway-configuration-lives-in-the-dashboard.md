# ADR-47: Railway Configuration Lives in the Dashboard Until `railway.ts`

**Status:** Accepted.
**Date:** 2026-09-14

## Context

Nine `railway.toml` / `railway.json` files sat beside their apps and services.
They looked like deployment configuration. They were not read.

Railway resolves a config file relative to a service's **root directory**, and
every service in this project deploying from this repository has its root set
to `/`. Railway therefore looked for `/railway.toml`, which does not exist, and
fell through to the dashboard.

The proof is a value that disagrees. Railway's own documentation says
"Configuration defined in code will always override values from the dashboard",
so a file that was read would win — and five of them lose:

| service             | file says `restartPolicyMaxRetries` | deployed |
| ------------------- | ----------------------------------- | -------- |
| `ragen-worker`      | 3                                   | **10**   |
| `ragen-api`         | 3                                   | **10**   |
| `ragen-app` (web)   | 3                                   | **10**   |
| `ragen-docs`        | 3                                   | **10**   |
| `presidio-analyzer` | 3                                   | **10**   |

The other three (`docling`, `litellm-proxy`, `apps/admin`) happen to agree, so
they prove nothing either way — absence of a mismatch is not evidence of being
read. `apps/mcp/railway.toml` has no deployed service at all.

**This cost real time before it was noticed.** During the ESM migration
(ADR-adjacent work in #1164 and #1166) the OpenTelemetry loader flags were added
to `apps/api/railway.toml` and `apps/worker/railway.toml` in good faith, and
both edits had to be reverted once the files turned out to be inert. The
architecture test that guards those flags had to grow a paragraph explaining why
it deliberately does *not* assert against `railway.toml`. A comment was doing a
file's job.

Two of the files also state something false rather than merely useless:
`apps/worker/AGENTS.md` told readers the worker runs with "max 3 retries",
quoting a file the platform ignores while production runs 10.

## Decision

**Delete all nine files.** Railway configuration lives in the dashboard until
this repository adopts `.railway/railway.ts`.

Config as Code (TOML/JSON) is **deprecated by Railway**, with a stated cutoff of
**1 December 2026**; the documented replacement is Infrastructure as Code via
`.railway/railway.ts`. So the choice was never "keep these or delete them" but
"delete them now, or migrate them to a format that is itself being retired".

## Why not make them live instead

Pointing each service's config path at its file is the option that sounds
better — configuration in the repository, versioned and reviewable — and it is
what these files were written for. It was rejected for now on two grounds:

1. **It is a silent production change.** Turning them on would move
   `restartPolicyMaxRetries` from the deployed 10 to the file's 3 on five
   services, because code overrides the dashboard. Nobody asked for a different
   restart policy, and it would arrive as a side effect of a tidy-up.
2. **It buys a deprecated format.** Any work here should target `railway.ts`,
   not TOML with fourteen months left on it.

## Consequences

- **A start command changes in the image, not in a file.** Every service's
  Dockerfile already carries its own `CMD`, including `apps/admin`, whose
  `CMD` is byte-identical to the `startCommand` its `railway.json` declared —
  so no service loses a start command by this deletion.
- Restart policy, root directory, Dockerfile path and replica counts are
  dashboard settings. They are not in version control, and that is a real
  downside this ADR accepts rather than hides.
- `tests/architecture/esm-apps-keep-their-runtime-contract.test.ts` no longer
  has to explain an exclusion; the files it was excluding are gone.
- Historical ADRs (21, 29, 30, 32) and specs that mention these files are left
  as written. They record what was true when they were written.

## Revisiting

Adopt `.railway/railway.ts` — before December 2026, and ideally while
introducing a new service rather than as a migration of its own. When that
happens, read the current dashboard values first and encode *those*, rather than
resurrecting the numbers in this repository's git history: they were never what
production ran.
