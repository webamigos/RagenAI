# infra/temporal/

**Nothing in this repository reads these files today.** They are kept
deliberately; this header is the decision, not an oversight.

`dynamicconfig/development-sql.yaml` is server-side configuration for a
`temporalio/auto-setup` container — Temporal's own `development-sql.yaml`,
unmodified since it was committed. `docker-compose.yml` mounted it until
[ADR-44](../../docs/adrs/44-bullmq-is-the-worker-runtime.md) made BullMQ the
worker runtime and #1223 took the Temporal service out of the default install.

## Why it stays, when `infra/litellm/` did not

The LiteLLM retirement ([ADR-49](../../docs/adrs/49-the-application-calls-model-providers-itself.md))
removed the code path as well as the container: nothing in the tree can call a
proxy any more, so its config had no second half to belong to. Temporal's
retirement is not that shape.

`@ragenai/jobs-temporal` moved to `webamigos/ragen-enterprise` in G3, but the
half that runs the workflows did not: `apps/worker` still ships
`temporal-runtime.ts` and `temporal-failure.ts`, still declares the SDK — a rule
[`tests/architecture/the-temporal-family-moves-together.test.ts`](../../tests/architecture/the-temporal-family-moves-together.test.ts)
still polices — and CI still runs `Jobs Parity` over both engines nightly. The
enterprise image layers the adapter onto this one. Deleting the server config
here would leave that image with a runtime it can select and no documented way
to stand the server up.

## What reads it, and what does not

- **The jobs integration suite does not.** `@temporalio/testing` starts a real
  server from a cached binary with its own defaults, so
  `WORKER_RUNTIME=temporal npm run test:jobs-integration` passes without this
  file. `JOBS_TEST_TEMPORAL_ADDRESS` points it at a server you run yourself.
- **A deployment running a real Temporal server does.** Mount this directory at
  `/etc/temporal/config/dynamicconfig` and set
  `DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml`, which is
  what the `temporalio/auto-setup:1.26.2` service did before it was removed —
  `git show d53fa62f6 -- docker-compose.yml` has that service verbatim, ports,
  Postgres wiring and all.

Nothing in the file is a Ragen setting, which is the other reason to keep it
rather than expect someone to reconstruct it: there is nothing here to remember,
only something to find.

The rest of the worker-runtime programme — F1 and G — is parked. If it closes by
taking Temporal out of `apps/worker` too, this directory goes in that same
change. Until then it is the other half of something that still runs.
