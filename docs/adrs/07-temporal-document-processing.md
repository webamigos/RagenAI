# ADR-07: Temporal for Document Processing

**Status:** **Superseded by [ADR-44](44-bullmq-is-the-worker-runtime.md)**
(2026-09-16). Accepted 2024-06-01 and correct for the design as it then stood.
Its one-line rejection of BullMQ — *"couples processing to the web server
process"* — was aimed at a coupling that no longer exists: the worker has been
its own service since [ADR-26](26-absorb-ragen-worker-into-monorepo.md), so the
engine choice no longer decides where parsing runs. Durable execution survives
as an enterprise adapter rather than as the default.
**Date:** 2024-06-01

## Context

Document processing (upload → parse → generate embeddings → store in vector DB) is a multi-step, long-running operation that can fail at any stage. It needs reliable execution, retry logic, and status tracking.

## Options Considered

1. **In-process background jobs** (e.g., Bull/BullMQ with Redis) — simple but couples processing to the web server process
2. **Temporal.io workflows** — durable execution engine with built-in retries, timeouts, and workflow history

## Decision

**Temporal.io** for async document processing workflows.

**Pipeline:** Upload → S3 → Temporal worker (`ragen-worker` repo) → Parse → Generate embeddings → Store in Meilisearch

**Rationale:**
- Durable execution — workflows survive process crashes and resume from last checkpoint
- Built-in retry policies per activity (parse, embed, store)
- Workflow history provides full audit trail of processing steps
- Status tracked via `ParsingStatus`/`EmbeddingStatus` enums in Prisma
- Worker runs as a separate service (`ragen-worker` repo), decoupling processing load from the web server
- Temporal UI (port 8080) for workflow inspection and debugging

## Conventions

- Workflows referenced by **string names**, not function imports (Temporal workflow definition limitation)
- Temporal client initialized in `src/libs/temporal/`
- Worker code lives in separate `ragen-worker` repository

## Consequences

- Additional infrastructure (Temporal server + worker service)
- Workflow versioning needed for breaking changes to workflow definitions
- Local development requires `docker compose up` to start Temporal server
- Google Drive folder imports also use Temporal for batch embedding (batches of 5)
