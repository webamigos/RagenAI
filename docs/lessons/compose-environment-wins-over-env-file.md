---
title: 'A literal in Compose `environment:` wins over `env_file:`, so the value in `.env.local` never reaches the container'
modules: ['compose', 'self-hosting']
areas: ['architecture']
topics: ['docker-compose', 'env-file', 'app-url', 'self-hosting', 'appliance']
---

# A literal in Compose `environment:` wins over `env_file:`, so the value in `.env.local` never reaches the container

**In short**: `docker-compose.fullapp.yml` set web's `APP_URL` to `http://localhost:${WEB_PORT}` in `environment:`. Compose gives `environment:` precedence over `env_file:`, so an `APP_URL` in `.env.local` was read by nothing, and every container install answered as localhost. The rename from `BETTER_AUTH_URL` (#1656) carried the literal over unchanged. A variable an operator is meant to set is written `${VAR:-default}` in `environment:`, and it is set in `.env` (the file Compose itself reads for interpolation) or the shell, not only in `.env.local`.

**Context**: writing `infra/appliance/install-spark.sh`, whose `--host` option has to change the address users open in the browser.

**Problem**:

- The precedence is deliberate and useful: it is what keeps `.env.local`'s `localhost` database address off the compose network, where `environment:` sets the service name instead. The same rule, applied to a variable the operator owns, silently discards the operator's value.
- Nothing fails. The container starts, the setting looks correct in `.env.local`, and the symptom (links and the sign-in origin pointing at localhost) appears only when someone opens the install from another machine.
- `.env.local` and `.env` look alike and do different things here: `env_file: .env.local` passes values into the container, while `${VAR}` in a compose file is interpolated from `.env` and the shell, never from `.env.local`.

**Rule**: in a compose `environment:` block, write a literal only for a value that must differ inside containers (service names, mounted paths). Anything an operator chooses is `${VAR:-default}`, documented as set in `.env`. `tests/architecture/the-app-url-reaches-the-web-container.test.ts` holds this for `APP_URL` and `NEXT_PUBLIC_APP_URL`.

**Applies to**: `docker-compose.fullapp.yml`, `docker-compose.appliance.yml` and every compose overlay; any installer that writes configuration for the container stack (`install-spark.sh`, `create-ragen-app`).
