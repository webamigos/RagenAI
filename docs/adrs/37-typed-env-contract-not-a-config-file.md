# ADR-37: A Typed Environment Contract, Not a Config File

**Status:** Accepted and implemented (the package and three consumers; see "What is not done").
**Date:** 2026-09-06

## Context

The question that prompted this was whether Ragen should grow a
`ragen.config.ts` in the shape of Payload CMS's `payload.config.ts` — on the
observation that the application is steered mainly through environment
variables today, and that a richer configuration or a plugin system might be
wanted later.

Measured, rather than assumed:

| | Count |
|---|---|
| Distinct environment variables read in source | **156** |
| Read sites (`process.env.X`) | **661** |
| Read by two or more apps | **76** |
| Read by three or more apps | **24** |
| Apps validating their environment | **1 of 6** (`apps/worker`) |

Sorted by what they actually are:

| Kind | Roughly | Could a config file own it? |
|---|---|---|
| Secrets and credentials | 46 | No — a file in git is the wrong home for a secret |
| Infrastructure endpoints | 34 | No — they differ per deployment, which is what env is for |
| `NEXT_PUBLIC_*`, baked in at build | 9 | No, and it would be worse — see the lesson on build-time baking |
| Feature flags | 6 | No — already resolved better, see below |
| Provider selection | ~7 | Maybe — the only real candidate |
| Model and tuning defaults | ~15 | Partly — shared packages already do this |

### Three configuration planes already exist

This is not an application steered "mainly by environment variables".
`packages/platform-contracts` resolves a feature flag from four layers in
order: a per-organization override (`OrganizationSettings.featureOverrides`),
the subscription plan, the platform default the admin panel edits
(`Settings.default_features`), and the code default. `OrganizationSettings`
carries 40 columns — models, limits, prompt, temperature, PII mode, model and
connector allowlists.

That is already richer than a config file can be, because it is per-tenant and
editable at runtime. A file in the repository is neither.

### Why the Payload analogy does not transfer

`payload.config.ts` exists because Payload is a framework you build an
application *inside*: the config declares collections, fields, access control
and hooks — it defines the data model. Ragen is an application. Its data model
is `prisma/schema.prisma`, and that role is taken.

There is also a concrete cost. A TypeScript config is readable only by Node.
`docker-compose.yml`, the Dockerfiles, Railway and the LiteLLM container all
configure the same system, and environment variables are the only language all
of them speak. A config file would not replace them; it would add a second
place to look, and a "which one wins" question.

## Decision

**No `ragen.config.ts`.** Instead, `@ragenai/env`: a typed, validated
environment contract, with the shared fragments in one package and each app
composing its own schema from them.

This is the same move ADR-26 made for the BM25 encoder and ADR-33 for the
feature flags and the model catalogue — the duplication was never a missing
config file, it was the same rule written down in several places where the
copies could drift apart unobserved.

The package provides:

- `parseEnv(schema, source)` — non-throwing, collecting **every** problem.
  Reporting all of them at once is the point: a boot loop that reveals one
  missing variable per restart turns a ten-minute setup into an afternoon.
- `parseEnvOrExit(schema, source, exit)` — for a process with no useful
  behaviour on a bad environment.
- Fragments for the variables more than one app reads: `targetEnv`,
  `targetEnvRequired`, `database`, `litellm`, `qdrant`, `observability`,
  `storage`, `tokenVault`, `encryption`.
- Cross-field rule helpers lifted from patterns `apps/worker` had already
  discovered: `requiredInDeployedEnvs`, `allOrNone`, `requiredForProvider`.
- `httpUrl()` and `blankAsUndefined()`.

### Two details that are the whole reason to have this

**`z.string().url()` does not check what you think.** It accepts
`localhost:4318`, because `new URL('localhost:4318')` does not throw — it
reads `localhost:` as the scheme and `4318` as the path. So the single most
likely way to mistype an endpoint, dropping `http://`, passes validation and
fails later from somewhere else. This had already cost us once: the same parse
quirk made `URL.origin` return the string `"null"` for a scheme-less OTLP
endpoint, silently disabling apps/mcp's exporter self-trace guard. `httpUrl()`
requires an http/https scheme.

**A blank variable must mean unset.** A cleared Railway variable or a `FOO=`
line in a compose file arrives as `''`. `@ragenai/observability`'s
`resolveServiceName()` and `@ragenai/storage`'s `resolveStorageProviderName()`
both trim and fall back, so a schema accepting `''` would reject a
configuration the runtime is perfectly happy with. `blankAsUndefined()` keeps
the schema and the runtime resolvers agreeing.

### Validation is per-app, and deliberately not uniform

A worker or an API server should refuse to start on a bad environment.
**apps/web must not**: it serves the setup page that tells a self-hosted
operator what to fix, and a process that exits cannot render the instructions
for fixing itself. That is why `parseEnv` does not throw and the exit is the
caller's choice.

`targetEnvRequired` exists for the same reason in reverse. Defaulting
`TARGET_ENV` to `local` is right for a fresh clone and dangerous for a
deployed service: unset on Railway it would read as `local`, and every
`requiredInDeployedEnvs` rule keyed off it would then wave through the
production deploy it exists to guard.

## Consequences

### Positive

- 5 of 6 apps read `process.env` with no validation today; a typo produced
  `undefined` and an error three layers away at runtime. Three now fail at
  boot with every problem listed at once.
- `apps/worker`'s 152-line schema shrank to its genuinely worker-local half.
- The shared rules have 39 tests, where the hand-written copies had none.
- Tightenings that came free with the shared fragments: `LITELLM_PROXY_URL`,
  `QDRANT_URL`, `S3_ENDPOINT_URL`, the vault URLs and the OTLP endpoint now
  reject a scheme-less value in every app that reads them.

### Negative

- A ninth workspace package.
- The schemas are not exhaustive over all 156 variables, and are not meant to
  be. A Zod object ignores keys it does not mention, so each schema validates
  what it lists and stays out of the way of the rest. This is a real gap: a
  variable absent from the schema is still unvalidated.
- Three apps now have two ways to read configuration — the schema and a bare
  `process.env` — until the 661 read sites migrate. Rewriting them all in one
  change would have been unreviewable.

## What is not done

- **apps/web and apps/admin have no schema yet.** They need the non-throwing
  treatment, and apps/web already has a
  `features/setup/services/queries/inspect-environment.ts` that inspects the
  environment and reports findings for the setup page. That should be rebuilt
  on this package rather than duplicated beside it, which is a design task
  rather than a mechanical one.
- **The 661 read sites still read `process.env` directly.** Migrating them is
  per-app and incremental; `apps/mcp` is done as the worked example.

## Revisit a config file when

Naming the triggers, so this decision has an expiry rather than becoming folklore:

- **Someone outside this repository needs to add a connector, storage backend
  or reranker.** Today every implementation is in-repo, and `PROVIDER_REGISTRY`
  is a `Record<McpConnectorProvider, …>`, so a missing entry fails *compilation*.
  A config file would lose that.
- **Self-hosting becomes a product rather than a possibility.** The
  `features/setup` surface already exists; if it grows into a wizard, a written
  configuration file becomes the thing the wizard writes.
- **A provider seam grows from "pick one of two or three with a string" into
  "compose a pipeline".** `DOCUMENT_PARSER` and `PDF_PROCESSOR` are the first
  candidates.
