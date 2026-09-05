# Presidio upgrade runbook

Procedure for upgrading the self-hosted Presidio (analyzer + anonymizer)
images. Use for every version bump. Keep this doc in sync with the `image:`
tags in `docker-compose.yml`, `infra/presidio/analyzer/Dockerfile`, and
`deploy/helm/ragen/values.yaml`.

Presidio is stateless, same as Docling — no backup step, no schema-migration
risk. Both services are off by default (`FEATURE_FLAG_PII_MASKING=0`); the
worker's own comment on that flag notes Presidio is two extra containers most
deployments don't need.

## The registry moved — read this before picking any tag

**Presidio moved from Microsoft to the independent Data Privacy Stack org**
(`github.com/data-privacy-stack/presidio`, 2026). `mcr.microsoft.com/presidio-*`
is now a **frozen legacy registry** — it stopped receiving new releases.
New releases publish only to `ghcr.io/data-privacy-stack/presidio-analyzer`
and `ghcr.io/data-privacy-stack/presidio-anonymizer`. Confirm which registry a
given tag actually lives on with `docker manifest inspect` before writing it
anywhere — don't assume `mcr.microsoft.com` still gets updates just because a
tag resolves there (old tags still exist, they just never get newer ones).

This also affects our own custom analyzer image
(`infra/presidio/analyzer/Dockerfile`), which is built `FROM` the upstream
analyzer image — its base needed the same registry change, not just a version
bump.

## Version history

| Date | From → To | Why this version |
|---|---|---|
| 2026-09-05 | `mcr.microsoft.com/presidio-{analyzer,anonymizer}` @ `2.2.362` → `ghcr.io/data-privacy-stack/presidio-{analyzer,anonymizer}:2.2.364` | Migrated off the frozen legacy registry (see above) as part of this bump, not a separate step — the two changes landed together since staying on `2.2.362` on the old registry was never going to get safer by waiting. `2.2.364` was the latest tag at the time (confirmed via the GitHub API's own release list, not a search summary — a WebFetch of the releases page briefly reported an internally-inconsistent date and was not trusted). Only two patch versions ahead of what was pinned; the project's own release notes report no breaking changes in that range for the Python package itself. **The base image's own packaging did break silently**, though: it switched from Poetry to `uv`, installing dependencies straight into the system Python rather than a Poetry-managed venv — the `poetry` binary no longer exists. Our custom Dockerfile's `CMD` invoked `poetry run gunicorn ...` and failed outright (`poetry: not found`) until fixed to call `gunicorn` directly (confirmed via the base image's own `entrypoint.sh`, which already does this). Not mentioned in any changelog — found only by actually building and running the new image. |

## Pre-upgrade

1. **Confirm the tag's registry and existence**: `docker manifest inspect ghcr.io/data-privacy-stack/presidio-analyzer:<tag>` (and `-anonymizer`) before writing it anywhere.
2. **Read the release notes** on `github.com/data-privacy-stack/presidio/releases` for every version between current and target.
3. **If bumping the custom analyzer image's base** (`infra/presidio/analyzer/Dockerfile`): actually build it (`docker compose build presidio-analyzer`) and run it — don't assume the base image's internals (Python packaging, entrypoint, user/permissions) stayed the same just because the Presidio Python package itself didn't have breaking changes. The Poetry→uv switch above is exactly the kind of thing that only shows up by running the container.
4. **Cross-check the two callers** — `apps/web/src/libs/pii/presidio-client.ts` (analyzer only, does its own client-side anonymization) and `apps/worker/src/activities/documents/mask-pii.ts` (both analyzer and anonymizer) — against the target version's `/analyze` and `/anonymize` request/response shapes.

## Upgrade

1. Edit the tag/registry in all relevant places (one commit, one diff):
   - `docker-compose.yml` (`presidio-anonymizer` image; `presidio-analyzer` builds locally from `infra/presidio/analyzer/`)
   - `infra/presidio/analyzer/Dockerfile` (`FROM` base image)
   - `deploy/helm/ragen/values.yaml` (`presidio.anonymizer.image`; `presidio.analyzer.image` is our own pushed image, a separate concern — see below)
2. Merge the PR.
3. **Compose (local/staging)**:
   ```bash
   docker compose build presidio-analyzer
   docker compose pull presidio-anonymizer
   docker compose up -d presidio-analyzer presidio-anonymizer
   docker compose logs -f presidio-analyzer presidio-anonymizer
   ```
4. **Production (Helm via Terraform)** — same model as the LiteLLM/Docling runbooks: `cd deploy/terraform && tofu plan && tofu apply`, then `kubectl logs deployment/<release>-presidio-analyzer` / `-presidio-anonymizer`.

**Note on `presidio.analyzer.image` in the Helm chart**: this points at
`ghcr.io/webamigos/ragen-presidio-analyzer`, our own custom-built image — not
directly at the upstream registry. There is currently no CI workflow that
builds and publishes this image, so it stays on `:latest` rather than a pinned
version tag; fixing that is a separate piece of infra work (setting up the
publish pipeline), out of scope for a Presidio version bump.

## Smoke tests

```bash
# 1. Health
curl -s http://localhost:5002/health   # analyzer
curl -s http://localhost:5003/health   # anonymizer

# 2. A real detection call
curl -s -X POST http://localhost:5002/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "Jan Kowalski, PESEL 44051401359", "language": "pl"}'

# 3. A real anonymize call using the analyzer's own output
# (paste the analyzer_results array from step 2 into the anonymizer call)
```

Then run the dedicated integration suite — real HTTP calls against both
containers, not mocked, covering PESEL/NIP/REGON/ID card/IBAN/credit
card/phone/email/person-name scenarios plus the full `maskPii` activity
round trip under each PII policy:

```bash
cd apps/worker
npm run test:presidio-integration
```

This is deliberately **not** part of `npm test`/`npm run worker:test` — it
needs the containers running, which CI and a fresh checkout don't have by
default. See `apps/worker/jest.presidio-integration.config.ts` for how it's
kept separate, and
`apps/worker/test/presidio-integration/mask-pii.presidio-integration.ts` for
the test cases themselves (all PII sample values are synthetic,
checksum-valid test data, not real people's identifiers).

## Rollback

1. Revert the tag/registry PR (or `git revert`) and redeploy.
2. No data to restore — both services are stateless.

## Post-upgrade

- Update `docs/regression-checklist.md` if any PII-masking regression step changed.
- Update this runbook if the procedure itself changed.
