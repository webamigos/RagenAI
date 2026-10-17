# On-premises appliance

Ragen on one machine with its models served by a local Ollama, so no model
call leaves it. The design, and what is still missing, is in
[the spec](../../docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md).

## Run it

1. Copy [`appliance.env.example`](appliance.env.example) to the repository
   root as `.env.local`, and fill in the three secrets. In this stack,
   `LLM_ROUTES_PATH` and `LLM_OLLAMA_BASE_URL` are set by the compose file, so
   their values in the template only matter when the apps run on the host.
2. Start everything:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.fullapp.yml -f docker-compose.appliance.yml up -d
   ```

   On a machine with an NVIDIA GPU and the NVIDIA Container Toolkit, add
   `-f docker-compose.appliance.gpu.yml`.

The first start pulls the models into the `ollama_models` volume, which is
about 20 GB for the default tier and needs the internet once. The web, api
and worker containers wait for that pull to finish. Later starts find the
models already there and need no network.

Docker Compose 2.24 or newer is required, because `docker-compose.fullapp.yml`
uses the `env_file: path:` form.

## The models

| Route | Model | Used for |
| --- | --- | --- |
| `local-chat` | `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` | answers |
| `local-small` | `qwen2.5:7b-instruct` | rephrase, summaries, Brain and memory extraction, the guardrail judge |
| `local-vision` | `gemma3:12b` | images and document attachments |
| `local-embed` | `bge-m3` | embeddings, 1024 dimensions |

Changing a model means changing three things together:

- the `model:` in [`routes.appliance.yaml`](../llm-gateway/routes.appliance.yaml)
- `APPLIANCE_MODELS` in `docker-compose.appliance.yml`
- `VECTOR_SIZE` for the embedder, plus a re-index

`tests/architecture/the-appliance-compose-pulls-what-the-route-table-names.test.ts`
fails when the first two disagree.

## Checking it

The sign-in page's setup checklist reports two problems: a model server
that is not answering, and a model that was never pulled. It also gives the
`ollama pull` command to run for each missing model.
