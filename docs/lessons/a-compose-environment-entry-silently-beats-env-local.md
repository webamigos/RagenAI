---
title: 'In the container stack a Compose `environment:` entry beats `.env.local`, so a value the template sets can be silently ignored'
modules: ['infra', 'appliance', 'web', 'api', 'worker', 'admin']
areas: ['architecture']
topics: ['docker-compose', 'env', 'env_file', 'appliance', 'self-hosting', 'pii', 'app-url']
---

# In the container stack a Compose `environment:` entry beats `.env.local`, so a value the template sets can be silently ignored

**In short**: `docker-compose.fullapp.yml` passes `.env.local` in with `env_file:` and then sets some of the same variables under `environment:`, which wins. With the appliance template, `docker compose config` showed PII masking off on web and the worker, `localhost` Presidio URLs on api, web's `APP_URL` fixed to `http://localhost:3000` whatever the template said, and apps/admin reading none of the root file. Nothing logs any of it. `docker compose config` is the only place the resolved value is visible.

**Context**: writing the appliance runbook (spec C4) and checking each env setting it names against `docker compose -f docker-compose.yml -f docker-compose.fullapp.yml -f docker-compose.appliance.yml config`, with `infra/appliance/appliance.env.example` copied to `.env.local`.

**Problem**:

- **`environment:` is applied after `env_file:`.** That is deliberate for addresses: it is what turns `localhost:55432` into `postgres:5432` inside a container. It is wrong for a setting the operator is supposed to own.
- **`${VAR:-}` interpolates from Compose's `.env`, not from `.env.local`.** `PRESIDIO_ANALYZER_URL: ${PRESIDIO_ANALYZER_URL:-}` on web and the worker is therefore empty unless `.env` sets it, and an empty `environment:` entry still overrides the template's value. api has no such entry, so it gets the template's `localhost:5002`, which inside its container points at nothing.
- **A literal wins outright.** web's `APP_URL: http://localhost:${WEB_PORT:-3000}` cannot be changed from either env file.
- **A different `env_file:` path is a different environment.** admin reads `apps/admin/.env.local`, so a root file with every secret does not reach it.
- The egress check sets `FEATURE_FLAG_PII_MASKING=0` and empty Presidio URLs, so it never exercised this.

**Rule**: before documenting or trusting an env setting for the container stack, read its resolved value with `docker compose … config` (or `config --format json`) and a copy of the real `.env.local`. Spelling the variable in a template proves nothing. When a compose file sets a variable under `environment:`, either give it a `${VAR:-default}` the operator can reach through `.env`, or document that the env file cannot change it.

**Applies to**: `docker-compose.fullapp.yml`, `docker-compose.appliance.yml`, `infra/appliance/appliance.env.example`, `docs/appliance-runbook.md`, and any new variable an install is told to set in `.env.local`.
