# LiteLLM upgrade runbook

Procedure for upgrading the self-hosted LiteLLM proxy image. Use for every version bump. Keep this doc in sync with the `image:` tag in `docker-compose*.yml` and `litellm/Dockerfile`.

## Pre-upgrade

1. **Pin the target tag.** Always pin a SemVer `-stable` tag (e.g. `v1.83.3-stable`). Never deploy `main-stable` — it floats.
2. **Read the release notes** for every version between the currently deployed tag and the target tag. Flag: breaking API changes, Prisma schema changes, config.yaml format changes, deprecated endpoints.
3. **Cross-check the ragen-app integration** in `src/libs/litellm/client.ts`. Confirm that every endpoint used there is still supported in the target version.
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

1. Edit the tag in all three places (one commit, one diff):
   - `docker-compose.yml`
   - `docker-compose.app.yml`
   - `litellm/Dockerfile`
2. Merge the PR.
3. On the target host:
   ```bash
   docker compose pull litellm
   docker compose up -d litellm
   docker compose logs -f litellm
   ```
4. Watch the logs until you see `Application startup complete` and no migration errors. As of v1.83.3 the proxy auto-runs Prisma migrations on boot; failures abort the process (opt-in `--enforce_prisma_migration_check` to fail fast without retry).

## Smoke tests

Run all three against the upgraded proxy before declaring success. `$KEY` is `LITELLM_MASTER_KEY`.

```bash
# 1. Health
curl -s -H "Authorization: Bearer $KEY" http://localhost:4000/health | jq .

# 2. Models list (exercises config.yaml parse)
curl -s -H "Authorization: Bearer $KEY" http://localhost:4000/v1/models | jq '.data | length'

# 3. Team round-trip (exercises Postgres + key generation)
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://localhost:4000/team/new \
  -d '{"team_id":"smoke-test-'$RANDOM'","team_alias":"smoke","max_budget":1,"budget_duration":"30d"}' | jq .
# Then delete it:
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://localhost:4000/team/delete \
  -d '{"team_ids":["<team_id from above>"]}' | jq .
```

Then send a real chat completion through ragen-app (e.g. from a staging org) and confirm it flows end-to-end.

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
