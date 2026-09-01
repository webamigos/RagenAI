# ADR-27: One Storage Abstraction, Local Filesystem by Default

**Status:** Accepted and implemented.
**Date:** 2026-08-31

## Context

Ragen is self-hosted software: the README's own security section promises that
"everything Ragen stores stays on infrastructure you control". Yet a fresh
install cannot start without S3 credentials, because `STORAGE_PROVIDER` defaults
to `s3` and env validation then demands `AWS_S3_BUCKET_NAME`,
`AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Object
storage is the right default for a hosted product and the wrong one for
software people run on their own box.

The abstraction to fix this mostly exists already — which is the interesting
part. A `StorageProvider` interface with `local` and `s3` implementations, and a
`STORAGE_PROVIDER` switch, is present in **two** of the three apps. What is
missing is a sane default, a shared implementation, and any documentation that
the S3 path already works with non-AWS providers.

### Where the code actually is today

| | `local` | `s3` | notes |
|---|---|---|---|
| `src/libs/storage/` | ✅ | ✅ | factory defaults to `s3` |
| `apps/worker/src/services/storage/` | ✅ | ✅ | factory defaults to `s3` |
| `apps/api/src/storage/` | ❌ | ✅ | NestJS `@Injectable`, no local variant |

`apps/api`'s service says so in a comment: *"this ports the S3 path only — add a
local variant here if apps/api ever needs the same dev fallback."* It needs it
now.

### The two copies have quietly diverged

`index.ts` (the factory) is byte-identical between app and worker and `types.ts`
differs by one line, but the providers themselves do not agree:

- **Path traversal.** The worker rejects absolute keys and any `..` segment
  *before* resolving, then re-checks the resolved prefix. ragen-app only does
  the prefix check. Both are safe today, but only one states the invariant
  plainly.
- **Missing files.** ragen-app throws a domain `NotFoundException`; the worker
  lets a raw `ENOENT` escape. Same event, two shapes.
- **Default path.** The worker falls back to `./data/storage`; ragen-app uses
  `process.env.STORAGE_LOCAL_PATH!` and crashes on a non-null assertion when it
  is unset.
- **S3 client config.** The worker passes `sessionToken` and parses
  `AWS_S3_FORCE_PATH_STYLE` leniently (`1|true|yes`); ragen-app supports neither,
  so `AWS_S3_FORCE_PATH_STYLE=true` silently does nothing there.
- **`downloadToFile`.** Worker-only, and genuinely needed — it streams a large
  object to a temp file for parsing instead of buffering it.

This is the same drift ADR-26 documented for the BM25 encoder, with one
important difference: **storage drift fails loudly.** A file written by one side
and not found by the other raises an error; it does not quietly degrade a
product behaviour the way a divergent tokenizer does. That is why this is worth
fixing but was not urgent.

## Decision

### 1. `packages/storage`, reconciled best-of-both

A workspace package on the `packages/rag-core` model (CommonJS build with
declarations, so a `tsc --build` → plain-node consumer can use it). It takes the
better half of each divergence: the worker's strict traversal check, default
path, S3 session-token support and lenient boolean parsing; ragen-app's
domain error on a missing object; the worker's `downloadToFile`.

The package owns its error type, `StorageNotFoundError`, rather than importing
either app's exception class.

### 2. The default becomes `local`

`STORAGE_PROVIDER` unset now means the local filesystem, rooted at
`STORAGE_LOCAL_PATH` (default `./data/storage`). S3 becomes opt-in. Env
validation only demands the `AWS_*` variables when `s3` is explicitly selected,
so `npm install && npm run dev` works with no cloud account.

**This is a breaking change for any deployment relying on the default.** Such a
deployment would begin writing to container-local disk and lose files on the
next restart. Every environment that uses object storage must set
`STORAGE_PROVIDER=s3` explicitly before this ships. That is called out in the
PR, the README and both `.env.example` files.

### 3. A hard warning when `local` meets production

`local` in production is right for a single-node self-hosted install and wrong
the moment there is more than one replica: the worker writes a file the app
cannot see, because they no longer share a filesystem. The factory logs a loud,
explicit warning when `STORAGE_PROVIDER` resolves to `local` while
`TARGET_ENV` is `production` or `staging`.

A warning, not a throw. Single-node production installs are a legitimate,
supported configuration for self-hosted software, and refusing to boot would
break them. The warning names the actual failure mode — replicas not sharing a
volume — rather than saying "not recommended".

### 4. `apps/api` gets a thin NestJS wrapper, not a fourth implementation

`S3StorageService` becomes a `StorageService` that delegates to the shared
provider and translates `StorageNotFoundError` into Nest's `NotFoundException`.
That translation is load-bearing: Nest maps its own exception to HTTP 404, and
letting the package's error escape unhandled would turn a 404 into a 500.

### 5. Document that S3-compatible storage already works

`AWS_ENDPOINT_URL` plus `AWS_S3_FORCE_PATH_STYLE` is exactly the mechanism
Cloudflare R2, MinIO and Ceph need. It is documented today only as a Scaleway
detail, which hides a capability the code already has. The docs name the
alternatives and give R2's endpoint form.

## Update: the default was cwd-relative, which broke the app -> worker handoff

Found by running the pipeline against a live stack after this ADR landed. With
`STORAGE_PROVIDER` unset, `./data/storage` was resolved against `process.cwd()`
— and the app runs from the repository root while the worker runs from
`apps/worker`. They resolved to different directories, so the app wrote an
upload the worker could never find. The default was broken in exactly the
single-node local setup it exists to serve.

Relative paths are now anchored to `npm_config_local_prefix`, which npm sets to
the workspace root for a script run from any workspace — which is how both
processes start. Absolute paths are untouched, and a process started outside npm
(the Docker image's `node dist/worker.js`) falls back to cwd and should set an
absolute `STORAGE_LOCAL_PATH` or use s3.

## Consequences

### Positive

- A fresh clone runs with no cloud credentials, matching what the README already
  claims about self-hosting.
- One implementation of path-traversal defence instead of two subtly different
  ones — the security-relevant code gets a single set of tests.
- `apps/api` stops being the odd one out.
- R2 and MinIO become discoverable rather than accidental.

### Negative

- **A breaking default.** Deployments that relied on `STORAGE_PROVIDER` being
  unset must set it explicitly, or silently start writing to ephemeral disk.
  This is the whole risk of the change and the reason it gets its own ADR.
- Local storage in a multi-replica deployment is a footgun that configuration
  alone cannot prevent; the warning mitigates but does not remove it.
- A fourth workspace package to keep building.

## Out of scope

- **Migrating existing data** between providers. There is no
  `storage migrate` command and this ADR does not add one.
- **Signed URLs / direct browser upload.** Everything still proxies through the
  app.
- **The `logger` split.** `otel-logger.ts` is triplicated the same way and is a
  fair candidate for a future package, but the main logger is not: ragen-app's
  is a webpack-swapped client/server pair and the worker's is plain server pino.
  Logger drift also costs only inconsistent formatting, so it does not earn a
  place here.
