# Docling upgrade runbook

Procedure for upgrading the self-hosted Docling (`docling-serve-cpu`) image.
Use for every version bump. Keep this doc in sync with the `image:` tag in
`docker-compose.yml`, `infra/docling/Dockerfile`, and
`deploy/helm/ragen/values.yaml`.

Docling is stateless — it parses documents synchronously and persists
nothing of its own (no database, no volume beyond model weights baked into
the image). That makes this simpler than the LiteLLM runbook: no backup
step, and no schema-migration risk.

## Version history

| Date | From → To | Why this version |
|---|---|---|
| 2026-09-05 | `v1.1.0` → `v1.32.0` | Latest tagged release at the time (released 2026-09-01, four days before this upgrade — verified via `docker manifest inspect ghcr.io/docling-project/docling-serve-cpu:v1.32.0`). The large version gap looked risky at first, but the project's own changelog shows the one genuinely breaking release (`v1.0.0`, a complete API/architecture overhaul to the "v1" orchestrator model) happened *before* our pinned `v1.1.0` baseline — everything from `v1.1.0` to `v1.32.0` is additive (new endpoints, new optional env vars, new source/target types). Confirmed against our actual usage: `apps/worker/src/services/docling-client.ts` only calls `/v1/convert/source` and `/health`, neither of which changed shape in this range. |

## Pre-upgrade

1. **Pin the target tag and check it exists**: `docker manifest inspect ghcr.io/docling-project/docling-serve-cpu:<tag>` before writing it anywhere.
2. **Read the changelog** (`https://github.com/docling-project/docling-serve/blob/main/CHANGELOG.md`) for every version between current and target. Flag anything touching `/v1/convert/source`, `/health`, or the env vars this repo sets or depends on (`DOCLING_SERVE_MAX_SYNC_WAIT`, `DOCLING_SERVE_LOAD_MODELS_AT_BOOT`, `DOCLING_SERVE_ENABLE_UI`, `DOCLING_NUM_THREADS`, and the upstream default of `DOCLING_SERVE_ENG_LOC_NUM_WORKERS`, which `DOCLING_MAX_CONCURRENCY` is sized against) — everything else is noise for our usage.
3. **Cross-check the client** in `apps/worker/src/services/docling-client.ts` and `apps/worker/src/utils/docling.ts` against the target version's API docs.
4. **Announce** the upgrade window if this is staging/production — Docling reloads its models at boot (`DOCLING_SERVE_LOAD_MODELS_AT_BOOT=true`), so the container takes noticeably longer than LiteLLM to report healthy (budget minutes, not seconds).

## Upgrade

1. Edit the tag in all three places (one commit, one diff):
   - `docker-compose.yml`
   - `infra/docling/Dockerfile`
   - `deploy/helm/ragen/values.yaml` (`docling.image`)
2. Merge the PR.
3. **Compose (local/staging)**:
   ```bash
   docker compose pull docling
   docker compose up -d docling
   docker compose logs -f docling
   ```
   Watch for the healthcheck to go green (`docker compose ps`) — the container's own `/health` gate takes longer than most services here because model loading happens at boot.
4. **Production (Helm via Terraform)** — same model as the LiteLLM runbook:
   ```bash
   cd deploy/terraform
   tofu plan
   tofu apply
   ```
   Verify with `kubectl logs deployment/<release>-docling -n <namespace> -f`, watching for the process to report ready (no separate migration step — Docling has no database).

## Smoke tests

```bash
# 1. Health
curl -s http://localhost:5001/health

# 2. A real conversion — exercises the actual endpoint apps/worker calls
curl -s -X POST http://localhost:5001/v1/convert/source \
  -H "Content-Type: application/json" \
  -d '{
    "options": {"to_formats": ["md"]},
    "sources": [{"kind": "file", "base64_string": "'"$(base64 -i /path/to/a/test.pdf)"'", "filename": "test.pdf"}]
  }' | head -c 500
```

Then run an actual document ingest through the worker (upload a real file in a local org) and confirm parsing succeeds end to end — `apps/worker/src/activities/loaders/load-docling.ts` is the code path this exercises.

## Capacity

An upgrade can change how much CPU and memory one conversion takes, so
re-measure after one, and on any new Docling host. What the numbers mean for
`DOCLING_SERVE_ENG_LOC_NUM_WORKERS`, `DOCLING_NUM_THREADS` and the worker's
`DOCLING_MAX_CONCURRENCY` is in "Sizing Docling" in
[`../document-processing.md`](../document-processing.md); the last recorded
measurement is there too.

```bash
# Sample the container while conversions run (Ctrl-C to stop)
docker stats --format '{{.CPUPerc}} {{.MemUsage}}' <docling-container>

# In another shell: N conversions at once, with the options apps/worker sends
python3 -c "import base64,json,sys;print(json.dumps({'options':{'to_formats':['md','json'],'do_ocr':True,'table_mode':'accurate','image_export_mode':'placeholder','do_table_structure':True},'sources':[{'kind':'file','base64_string':base64.b64encode(open(sys.argv[1],'rb').read()).decode(),'filename':'test.pdf'}]}))" /path/to/a/test.pdf > body.json
for i in 1 2; do
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -X POST http://localhost:5001/v1/convert/source \
    -H "Content-Type: application/json" --data-binary @body.json &
done; wait
```

Run it once and discard the result: the first conversion on each Docling worker
loads its models and is several times slower. Then 1, 2 and 4 at once. If two
take twice as long as one, the host has no cores for a second worker and
raising the ceiling will not help.

## Rollback

1. Revert the tag PR (or `git revert`) and redeploy.
2. No data to restore — Docling holds no state, so a rollback is just re-pulling the previous image.

## Post-upgrade

- Update `docs/regression-checklist.md` if any document-processing regression step changed.
- Update this runbook if the procedure itself changed.
