---
title: '`docker compose config` folds a long value across lines in YAML, so a script that greps one key gets the first 80 columns of it — read the JSON form'
modules: ['infra', 'appliance']
areas: ['architecture']
topics: ['docker-compose', 'shell', 'appliance', 'offline-bundle', 'silent-failure']
---

# `docker compose config` folds a long value across lines in YAML

**In short**: `docker compose config` prints YAML, and YAML folds a long plain scalar: `APPLIANCE_MODELS`, four model ids separated by spaces, came out as one line holding the first two and a continuation line holding the rest. A `grep APPLIANCE_MODELS` or a `sed` on that line returns half the list and exits 0. `docker compose config --format json` prints every key and its whole value on one line; read that.

**Context**: the offline bundle's builder (`infra/appliance/bundle/build-bundle.sh`) must bundle the models the release's `ollama-models` job pulls, and must not keep its own copy of the list. The list lives in one place, the service's `APPLIANCE_MODELS` environment value, and Compose is what resolves it (the default in the file, or an override in `.env`). Asking Compose and reading the one line looked like the whole job.

**Problem**: the resolved YAML is

```yaml
      APPLIANCE_MODELS: SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M qwen2.5:7b-instruct
        gemma3:12b bge-m3
```

The value is intact as YAML and cut in half as text. A line-oriented read gives two models of four, with no error anywhere: the bundle would have been built and checksummed with half its models, to be found out on a machine with no network to fetch the rest. Whether a value folds depends on its length, so a shorter list would have passed every test.

**Rule**: from a shell script, read `docker compose config --format json`. It is pretty-printed with one key per line and never folds a string, so a single `sed` on `"KEY": "value"` is safe without `jq`. Read the YAML form only with a YAML parser. And test the reader against the real `docker compose config` output, not a fixture written by hand: `config` needs no daemon, so the test runs anywhere the CLI is installed (`tests/scripts/appliance-offline-bundle.test.ts`).

**Applies to**: `infra/appliance/bundle/lib.sh` (`compose_json_value`, `compose_json_models`), and any script that reads a resolved Compose value. `install-spark.sh` reads `name:` from the YAML form, which is safe only because a project name is short.
