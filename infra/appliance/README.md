# On-premises appliance

Ragen on one machine with its models served by a local Ollama, so no model
call leaves it. The design, and what is still missing, is in
[the spec](../../docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md).

## Run it

### With the script (NVIDIA DGX Spark, or any Linux host with an NVIDIA GPU)

```bash
bash infra/appliance/install-spark.sh --host <address users open>
# or, with no checkout yet:
curl -fsSL https://raw.githubusercontent.com/webamigos/RagenAI/main/infra/appliance/install-spark.sh | bash -s -- --host <address>
```

[`install-spark.sh`](install-spark.sh) does the manual steps below and checks
what they assume:

- Docker Compose 2.24+, a GPU visible inside containers, enough disk;
- every image is for the host's architecture. A missing arm64 image is not an
  error anywhere — Docker emulates the amd64 one, slowly — so the script warns;
- `.env.local` from the template, with every empty secret generated. A re-run
  keeps the secrets that are there;
- **no encryption key by default**, so a test install leaves nothing that has
  to be kept. The provider is cleared and messages are stored in plaintext,
  which the containers allow because they run with `TARGET_ENV=local`.
  `--encrypt` generates `ENCRYPTION_MASTER_KEY`; a key already in `.env.local`
  is always kept;
- `--host` becomes `APP_URL`, written to `.env` as well as `.env.local`:
  web's `environment:` reads it from `.env` (Compose's own file), and
  `environment:` wins over `.env.local`;
- `COMPOSE_FILE` in `.env`, so a bare `docker compose ps`, `logs` or `down` in
  the checkout addresses the whole appliance;
- after the model pull, one prompt to the small model and `ollama ps`, which
  must say `100% GPU`. If it does not, the pinned Ollama image probably does
  not support the GPU; it warns rather than fails;
- it waits for the web app to answer.

`--cpu` skips the GPU check and overlay, `--encrypt` turns on message
encryption, `--version` pins the image tag,
`--dir` and `--ref` choose where and what to clone.

### By hand

1. Copy [`appliance.env.example`](appliance.env.example) to the repository
   root as `.env.local`, and fill in the secrets. In this stack,
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

## Proving nothing leaves the machine

```bash
npm run appliance:egress-check
```

This runs the appliance on a Compose network with no route out
([`docker-compose.appliance.sealed.yml`](../../docker-compose.appliance.sealed.yml)),
signs up an account, ingests a document and asks a question about it. It
fails if any container tried to reach anything off that network, and names
the container and the host it asked for. It watches the network bridge with
tcpdump rather than checking against a list of allowed domains, so a new call
to a new service shows up the day it is added.

- **It runs from a temporary directory** with an environment generated from
  [`appliance.env.example`](appliance.env.example), in its own Compose
  project. This checkout's `.env.local`, cloud keys included, never reaches
  it. Every published port is a random one, so it does not collide with a
  stack already running.
- **By default it swaps every model for a small pair**: `qwen2.5:0.5b` and
  `all-minilm` (384 dimensions). The check is about traffic, not answer
  quality. `--full-models` runs the real route table, which needs the
  hardware for it.
- **Models are pulled before the network is sealed.** That is the one step
  that needs the internet. The models volume is kept between runs, so the
  second run pulls nothing.
- **It checks that it can see before it trusts a clean result.** A canary
  container makes one lookup and one connection that must fail. If the
  capture missed either, the run fails. On Docker 26 and later, an internal
  network's resolver may stop forwarding names, which would hide lookups.
- `--keep` leaves the stack running for a look around, and `--version` pins
  the image tag (the default is `latest`).

Its first runs found seven services calling home. Each is switched off, with a
comment naming the host it asked for. Ollama's is in
`docker-compose.appliance.yml`; the rest are in the standard stack
(`docker-compose.yml`, `docker-compose.fullapp.yml`), which the appliance
inherits:

| Service | Host | Switch |
| --- | --- | --- |
| qdrant | `telemetry.qdrant.io` | `QDRANT__TELEMETRY_DISABLED` |
| api, worker, web, admin, migrate | `checkpoint.prisma.io` | `CHECKPOINT_DISABLE` (also set in each app image) |
| ollama | `ollama.com` | `OLLAMA_NO_CLOUD` |
| docling | `api.gradio.app`, `raw.githubusercontent.com` | `DOCLING_SERVE_ENABLE_UI=false`, `GRADIO_ANALYTICS_ENABLED=False` |
| docling | `huggingface.co` | `HF_HUB_OFFLINE` |
| docling | `mobile.events.data.microsoft.com` | `ORT_DISABLE_TELEMETRY` |

Not covered yet: Brain, the guardrail first pass, the hybrid profile and a
CI job (A3b in the spec).
