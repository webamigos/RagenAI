# LiteLLM upgrade runbook

Procedure for upgrading the self-hosted LiteLLM proxy image. Use for every version bump. Keep this doc in sync with the `image:` tag in `docker-compose*.yml`, `infra/litellm/Dockerfile`, and `deploy/helm/ragen/values.yaml`.

## Version history

| Date | From → To | Why this version |
|---|---|---|
| 2026-09-05 | `v1.83.10-stable` → `v1.99.1` | Latest tagged release at the time — picked over pinning an older intermediate tag so the jump only has to be made (and its release notes read) once. Confirmed the tag exists via `docker manifest inspect ghcr.io/berriai/litellm:v1.99.1` before writing it anywhere (see the tag-existence note below — several tags in this range that *look* plausible, like `v1.90.0-stable`/`v1.97.1-stable`, don't actually exist). Also added five new `model_list` entries in the same change — unrelated to the version bump itself, bundled because it touched the same config file: `claude-sonnet-5`/`claude-opus-5` (AWS Bedrock, model IDs cross-checked against AWS's model cards, live-tested against this account's actual Bedrock access), and `gpt-5.6-sol`/`gpt-5.6-terra`/`gpt-5.6-luna` (Azure, real deployments confirmed live the same day but not yet reachable from this environment — no local Azure credentials). See `infra/litellm/config.yaml` for the per-model verification notes. |

## Pre-upgrade

1. **Pin the target tag — but check the tag actually exists first.** BerriAI stopped publishing `-stable` tags somewhere around v1.90.0: `docker manifest inspect ghcr.io/berriai/litellm:v1.90.0-stable` and `v1.97.1-stable` both return "manifest unknown", while the bare `v1.99.1` and the older `v1.83.10-stable` both resolve. Run `docker manifest inspect ghcr.io/berriai/litellm:<tag>` against your actual target before writing it into any file — don't assume the `-stable` suffix still exists for a version past v1.90.0, and don't assume a bare tag existed for versions before that either. Never deploy `main-stable` — it floats regardless of era.
2. **Read the release notes for every version between the currently deployed tag and the target tag** — for a large jump (double-digit minor versions) this can be 10+ releases; skim each rather than skipping to the target's own notes; something written for an intermediate version can shape data already migrated by the time you reach the target. Flag: any release banner marked "contains breaking changes" (GitHub renders it at the top of that release's notes), Prisma schema/migration-behavior changes, config.yaml format changes, deprecated/removed endpoints. LiteLLM's proxy has auto-run Prisma migrations on boot since v1.83.3 (`--enforce_prisma_migration_check` opts into failing fast instead of retrying) — re-confirm this is still how the target version behaves, since a "run migrations on boot" default is exactly the kind of thing a later release can quietly change.
3. **Cross-check the apps/web integration** in `src/libs/litellm/client.ts`. Confirm that every endpoint used there is still supported in the target version.
4. **Announce** the upgrade window in #ragen-ops. LiteLLM restart is ~30s; expect chat/ingest latency spike or brief 5xx during the restart.

## Backup (mandatory)

Before any image bump, snapshot the LiteLLM Postgres so schema migrations on boot are reversible.

```bash
docker exec ragen-litellm-postgres \
  pg_dump -U litellm -d litellm \
  --format=custom --file=/tmp/litellm-backup-$(date +%Y%m%d-%H%M%S).dump

docker cp ragen-litellm-postgres:/tmp/litellm-backup-*.dump ./backups/
```

Store the dump somewhere you will actually find it 30 days from now.

## Upgrade

1. Edit the tag in all four places (one commit, one diff):
   - `docker-compose.yml`
   - `docker-compose.app.yml`
   - `infra/litellm/Dockerfile`
   - `deploy/helm/ragen/values.yaml` (`litellm.image`, for self-hosted Helm installs — easy to miss since it isn't part of the compose-based local/staging path)
2. Merge the PR.
3. **Compose (local/staging)** — on the target host:
   ```bash
   docker compose pull litellm
   docker compose up -d litellm
   docker compose logs -f litellm
   ```
4. **Compose (local/staging)** — watch the logs until you see `Application startup complete` and no migration errors. As of v1.83.3 the proxy auto-runs Prisma migrations on boot; failures abort the process (opt-in `--enforce_prisma_migration_check` to fail fast without retry). By v1.99.1 boot also logs a migration-resolver notice: `LiteLLM Proxy: Using default (v1) migration resolver. If your deployment has seen schema thrashing during rolling deploys, try --use_v2_migration_resolver (safer: avoids the diff-and-force recovery that caused the thrash).` — only relevant if you run multiple proxy replicas that migrate concurrently (our single local/staging instance doesn't), but check this if a future multi-replica deploy sees migration flakiness.
5. **Production (Helm via Terraform)** — see `deploy/terraform/README.md` and `deploy/helm/ragen/README.md` for the full model. In short:
   ```bash
   cd deploy/terraform
   tofu plan   # confirm only the litellm release/image value changes
   tofu apply
   ```
   Terraform owns the release and its values (including `litellm.image`, already edited in step 1); Helm owns the workloads. `atomic = true` on the release means a failed upgrade rolls back automatically rather than leaving old and new pods mixed against one database.

   There is no separate migration step to run by hand for LiteLLM itself: the chart's `templates/migrate-job.yaml` `pre-install,pre-upgrade` hook fires automatically as part of the same `tofu apply`, but it only runs the **app's own** Prisma migrations (`apps/web`'s schema, via the web image) — it has nothing to do with LiteLLM's database. LiteLLM migrates its own separate Postgres internally at container boot, the same auto-migration-on-boot behavior already described in step 4 above; it just happens inside the new pod instead of a `docker compose` container.

   Verify with:
   ```bash
   kubectl logs deployment/<release>-litellm -n <namespace> -f
   ```
   watching for the same `Application startup complete` line and no migration errors.

## Smoke tests

Run all three against the upgraded proxy before declaring success. `$KEY` is `LITELLM_MASTER_KEY`.

```bash
# 1. Health
curl -s -H "Authorization: Bearer $KEY" http://localhost:4000/health | jq .

# 2. Models list (exercises config.yaml parse)
curl -s -H "Authorization: Bearer $KEY" http://localhost:4000/v1/models | jq '.data | length'

# 3. Team round-trip (exercises Postgres + key generation)
team_id=$(curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://localhost:4000/team/new \
  -d "{\"team_id\":\"smoke-test-$RANDOM\",\"team_alias\":\"smoke\",\"max_budget\":1,\"budget_duration\":\"30d\"}" \
  | tee /dev/stderr | jq -r '.team_id')
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://localhost:4000/team/delete \
  -d "{\"team_ids\":[\"$team_id\"]}" | jq .
```

Then send a real chat completion through apps/web (e.g. from a staging org) and confirm it flows end-to-end.

## Rollback

If a smoke test fails, or errors flood the logs:

1. Revert the tag PR (or `git revert`) and redeploy.
2. Restore the Postgres dump **only if** the new version ran schema migrations that are incompatible with the previous version:
   ```bash
   docker cp ./backups/litellm-backup-<ts>.dump ragen-litellm-postgres:/tmp/
   docker exec ragen-litellm-postgres \
     pg_restore -U litellm -d litellm --clean --if-exists /tmp/litellm-backup-<ts>.dump
   docker compose restart litellm
   ```
3. Re-run the smoke tests against the restored version.

## Post-upgrade

- Update `docs/regression-checklist.md` if any regression step changed (e.g. new team-level behavior worth testing).
- Delete backup dumps older than 30 days.
- Update this runbook if the procedure itself changed.
