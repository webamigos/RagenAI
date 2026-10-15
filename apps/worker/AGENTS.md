# apps/worker — AGENTS.md

Background jobs — ingest, parsing, embeddings, scraping — on **BullMQ over
Redis** behind the `@ragenai/jobs` seam (ADR-44); Temporal is an adapter
(`WORKER_RUNTIME=temporal`). The root `AGENTS.md` and `docs/lessons.md` apply
here too. **Read [`docs/agent-guide.md`](docs/agent-guide.md) before nontrivial
work** — this file holds only the rules, because Codex reads it and the root
file under one 32 KiB budget.

```bash
npm run dev                     # watch mode; needs Redis (docker compose up redis)
npm run test                    # Vitest
npm run test:jobs-integration   # the BullMQ gate — real queues, Redis db 15
npm run typecheck               # both tsconfigs; test/ lives outside src/
```

- **Payloads and step results are plain objects** — both engines serialize.
- **Handlers must survive redelivery.** A stalled job runs again, possibly in
  parallel; ingest clears a file's chunks before writing because Qdrant ids
  are random. Code that blocks the event loop (`sharp`, `resvg`, `pdfium`,
  `xlsx`) is what causes the stall.
- **Retries belong to the step** (`ctx.steps`), never BullMQ's job `attempts`.
- **Redis must not evict** — the worker refuses `maxmemory-policy` other than
  `noeviction`.
- **Cancellation is a row**: `CANCELLED` on the file, read at checkpoints via
  `ctx.checkCancelled({ fileId, orgId })` — not a signal, not a run id.
- **Prisma comes from the root schema** (`workerClient` generator, output in
  `apps/worker/generated/`); there is no Knex.
- **Never import a handler to start a job** — start it by name through
  `@ragenai/jobs`.
- **No e2e covers the worker** (`e2e.yml` starts none); the jobs integration
  suite is the only end-to-end check. A start command changes in the
  Dockerfile `CMD`, not Railway.
- Vitest specs: `vi.hoisted` for anything a `vi.mock` factory closes over; a
  mocked constructor is a `function`/`class`, never an arrow.
