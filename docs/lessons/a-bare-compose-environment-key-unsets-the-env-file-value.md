---
title: 'A bare `KEY:` under a Compose `environment:` does not fall back to `env_file:` — it unsets the variable, so the only way to let `.env.local` decide is to leave the key out'
modules: ['infra', 'appliance', 'web', 'api', 'worker', 'admin']
areas: ['architecture']
topics: ['docker-compose', 'env', 'env_file', 'appliance', 'self-hosting', 'pii', 'app-url', 'silent-failure']
---

# A bare `KEY:` under a Compose `environment:` unsets the `env_file:` value

**In short**: in `docker-compose.fullapp.yml` every app reads `.env.local` with `env_file:`, and any key also under `environment:` wins. Neither of the two forms that look like "pass it through" does: `KEY: ${KEY:-}` interpolates from Compose's `.env` (empty on most installs) and `KEY:` with no value takes the shell's value or, failing that, *removes* the variable, and the `env_file:` value goes with it. `docker compose config` printed `A: null` with `A=fromlocal` in the env file. A key the operator owns has to be absent from `environment:` altogether.

**Context**: fixing PII masking and `APP_URL` in the container stack (`fix(compose): PII masking and APP_URL reach the containers`). Both were set under `environment:`, so `.env.local` lost. The first idea was to keep the keys and write them bare, so a shell or `.env` value could still override.

**Problem**:

- A bare `KEY:` is resolved from the shell and `.env` only. If neither has it, the variable is not set in the container, even though `env_file:` set it.
- `KEY: ${KEY:-default}` has the same problem with a default: the `.env.local` value never shows.
- A different `env_file:` path is a different environment. apps/admin reads `apps/admin/.env.local`, so a root file with every secret does not reach it.
- Nothing logs a resolved value, and a template spelling the variable proves nothing about it. The appliance template turned masking on, yet `docker compose config` showed it off on web and the worker; the egress check runs with masking off, so it never noticed. It surfaced only when the appliance runbook checked each setting it names against `config` with the template copied to `.env.local`.
- What the container needs differs from the host for an address (`presidio-analyzer:3000` against `localhost:5002`), and Compose cannot rewrite one into the other. An opt-in that needs a container-side address therefore has to be a signal Compose itself sees. Here that is an overlay file, `docker-compose.pii.yml`, which is only on the command line when someone asked for masking.

**Rule**: under `environment:` in a file that also has `env_file:`, write only values that must differ inside the network. Leave out anything the operator owns: no bare key, no `${KEY:-}`. When an opt-in needs a container address, ship an overlay that sets it, and use `profiles: !reset []` there to start the services it needs (Compose 2.24+). Before documenting or trusting a setting for the container stack, read its resolved value with `docker compose … config --format json` and a copy of the real `.env.local`. `tests/architecture/the-container-stack-leaves-operator-settings-to-env-local.test.ts` enforces this for `APP_URL` and the PII keys.

**Applies to**: `docker-compose.fullapp.yml`, `docker-compose.appliance*.yml`, `docker-compose.pii.yml`, `infra/appliance/appliance.env.example`, `docs/appliance-runbook.md`, and any new setting the docs tell an operator to put in `.env.local`.
