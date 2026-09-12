---
sidebar_position: 3
---

# Open models, no outbound traffic

Ragen sends every model call to exactly one place: the LiteLLM proxy you run.
Point that proxy at a model server on your own network and no prompt, no
document chunk and no question ever leaves it.

This page is the part the [Self-hosting](/docs/self-hosting) page calls
"deployment work, not a flag" — what to serve, how to wire it in, and the
handful of calls that still reach outward unless you turn them off.

## The shape of the change

```
apps/web ─┐
apps/api  ├─→ LiteLLM proxy ─→ vLLM / Ollama on your GPU box
worker   ─┘        ↑
            infra/litellm/config.yaml
```

Nothing in the application knows which model answered. Swapping a commercial
API for a local server is an edit to `infra/litellm/config.yaml` plus a few
environment variables — the application code does not change, and neither does
anything about how documents are stored, indexed or retrieved.

The work is on the serving side: a GPU, a model that fits it, and an honest
look at whether the answers are good enough. That last part is not rhetorical —
see [Measure before you commit](#measure-before-you-commit).

## Pick a server

Both speak an OpenAI-compatible API, which is all LiteLLM needs.

|            | **Ollama**                            | **vLLM**                                             |
| ---------- | ------------------------------------- | ---------------------------------------------------- |
| Good for   | A pilot, one box, a handful of people | Real concurrency, a team or a product                |
| Hardware   | Runs on CPU; a GPU makes it usable    | NVIDIA GPU, model must fit VRAM                      |
| Throughput | One request at a time, in practice    | Continuous batching — many at once                   |
| Setup cost | `ollama pull`, done                   | Choose a model, a quantisation, tensor-parallel size |
| Embeddings | `/v1/embeddings`                      | `/v1/embeddings` with an embedding model             |
| Reranking  | No rerank endpoint                    | `/v1/rerank`, Cohere/Jina-compatible                 |

A reasonable path is Ollama first, to prove the wiring and get a feel for answer
quality, then vLLM once more than one person is asking questions at a time.

### Rough VRAM arithmetic

Weights alone need about 2 bytes per parameter at bf16, or roughly 0.6 bytes at
4-bit — so an 8B model is ~16 GB unquantised and ~6 GB quantised, and a 70B-class
model is out of reach of a single 48 GB card unless it is quantised. Add headroom
for the KV cache, which grows with context length and with the number of
concurrent requests. RAG prompts are long: a retrieved-chunk prompt is easily
4–8k tokens, so budget more cache than a chatbot demo suggests.

If your documents are not in English, weigh multilingual ability heavily. Ragen
ships a Polish-language UI and Polish prompt templates on some worker paths, and
a model that is strong in English and mediocre in your language will look like a
retrieval problem when it is not.

## Four jobs, not one

The mistake that costs the most time here: pointing `DEFAULT_MODEL` at a local
model, watching chat work, and concluding the install is isolated. It is not.
Ragen calls a model in four different places, each with its own variable and its
own **cloud-hosted default**.

| Job                              | Variable           | Default if unset          | Runs when                        |
| -------------------------------- | ------------------ | ------------------------- | -------------------------------- |
| Answering                        | `DEFAULT_MODEL`    | `gemini-3-flash-preview`  | Every question                   |
| Rephrase + multi-query expansion | `REPHRASE_MODEL`   | `gemini-2.5-flash`        | Every question, before retrieval |
| Document summary at ingest       | `SUMMARY_MODEL`    | `gemini-2.5-flash`        | Every document                   |
| Embeddings                       | `EMBEDDINGS_MODEL` | `bge-multilingual-gemma2` | Every document, every question   |

Set all four. Leaving `REPHRASE_MODEL` alone is the common miss: it sends the
user's question and the conversation so far to a cloud model on _every_ turn,
which is exactly the traffic an isolated deployment exists to prevent.

Two more, if the relevant path is in use:

- `RERANK_MODEL` / `RERANK_PROVIDER` — only when `FEATURE_FLAG_RERANKING=1`.
- `PDF_MODEL` — only on the legacy PDF loader, which `DOCLING_STRICT=1` prevents
  from running at all. Set that flag and this one stops mattering.

## Wiring vLLM in

Serve the model, giving it the name you want to use in Ragen:

```bash
vllm serve Qwen/Qwen3-8B \
  --served-model-name local-chat \
  --host 0.0.0.0 --port 8000
```

Add it to `infra/litellm/config.yaml`. The `hosted_vllm/` prefix is LiteLLM's
route for a self-hosted OpenAI-compatible vLLM server:

```yaml
model_list:
  - model_name: local-chat
    litellm_params:
      model: hosted_vllm/local-chat
      api_base: http://vllm:8000/v1
      api_key: none # vLLM accepts any value unless started with --api-key
```

If vLLM runs as a container beside the rest of the stack, put it on the same
network so `http://vllm:8000` resolves:

```yaml
# docker-compose.override.yml
services:
  vllm:
    image: vllm/vllm-openai:latest
    command: ['--model', 'Qwen/Qwen3-8B', '--served-model-name', 'local-chat']
    networks: [ragen-network]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

If it runs on a separate GPU host, use its address instead — LiteLLM only needs
to reach it.

Then restart the proxy and confirm it sees the model:

```bash
docker compose restart litellm
curl http://localhost:4000/v1/models
```

## Wiring Ollama in

```bash
ollama pull qwen3:8b
```

```yaml
model_list:
  - model_name: local-chat
    litellm_params:
      model: ollama_chat/qwen3:8b
      api_base: http://ollama:11434
```

Use `ollama_chat/`, not `ollama/` — the first goes to Ollama's chat endpoint and
gives better results. If Ollama runs on the host rather than in the compose
network, `http://host.docker.internal:11434` reaches it from the LiteLLM
container on Docker Desktop; on Linux, use the host's address on the bridge.

## Embeddings, and the one setting you cannot change later

Embeddings must come from somewhere local too, or every document you ingest is
sent out to be vectorised. Both servers expose `/v1/embeddings`, so either can
serve them — through the OpenAI-compatible route in both cases:

```yaml
- model_name: local-embed
  litellm_params:
    model: openai/local-embed # Ollama: openai/bge-m3, api_base http://ollama:11434/v1
    api_base: http://vllm-embed:8000/v1
    api_key: none
```

```bash
EMBEDDINGS_MODEL=local-embed
VECTOR_SIZE=1024   # must equal the model's output dimensionality
```

`VECTOR_SIZE` and the embedding model have to agree or **Qdrant rejects every
upsert** — the failure looks like a broken ingest, not a configuration mistake.
`bge-m3` and `multilingual-e5-large` are 1024; Ragen's default
`bge-multilingual-gemma2` is 3584. Check your model's number rather than
assuming.

:::warning Set it before the first document
A Qdrant collection is created with a fixed vector size. Changing the embedding
model afterwards makes every existing vector incompatible, and the only way
forward is to re-index the whole corpus. Decide this before you ingest anything
you would mind re-ingesting.
:::

## Reranking locally (optional)

Reranking is off unless `FEATURE_FLAG_RERANKING=1`. It is worth having, and it
can stay on your network: the default rerank path is a plain client for a
Cohere-shaped `POST /rerank`, and vLLM's rerank endpoint speaks that shape.

```bash
vllm serve BAAI/bge-reranker-v2-m3 --served-model-name local-rerank --port 8001
```

```bash
FEATURE_FLAG_RERANKING=1
SCW_API_BASE=http://vllm-rerank:8001/v1   # the client calls {SCW_API_BASE}/rerank
SCW_API_KEY=unused                        # must be non-empty; the value is not checked locally
RERANK_MODEL=local-rerank
```

The variable names say Scaleway because that is the provider they were written
for. They are the generic local-rerank knobs today; nothing in that path is
Scaleway-specific, and it bypasses LiteLLM entirely, so the rerank model needs
no entry in `config.yaml`.

## How the model shows up in the app

A model LiteLLM serves appears in the chat model picker automatically — Ragen
reads `/v1/models` from the proxy at runtime, and an ID it does not recognise is
shown with a label inferred from the ID. You do not have to touch code to add a
model.

You do have to touch code for two things:

- **A nicer name.** Add an entry to `MODEL_REGISTRY` in
  `packages/platform-contracts/src/llm/model-catalog.ts` with a `displayName`.
- **Hiding a non-chat model.** An embedding model listed in LiteLLM shows up in
  the _chat_ picker unless its registry entry says `visible: false`. Users
  picking `local-embed` to answer a question is a confusing failure; add the
  entry.

Per-organization allowlists (**Admin → Models**) work on the same IDs, so a
local model can be restricted per organization like any other.

## What still reaches outward

Everything below is either off by default or a deliberate integration. Go
through the list rather than assuming the model swap finished the job.

| Path                       | Status                           | What to do                                                                                                                                             |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Content moderation         | Off (`MODERATION_ENABLED` unset) | Leave it off. When on, it calls OpenAI's moderation endpoint **directly** — it is the one model call that does not go through LiteLLM.                 |
| Legacy PDF parsing         | Fallback, silent                 | `DOCLING_STRICT=1`. Docling parses locally by default, but a Docling failure otherwise falls back to a loader that sends the PDF to an external model. |
| MCP connectors             | Opt-in per organization          | Slack, HubSpot, Google and the rest are outbound by definition. Leave them unconfigured, or accept the traffic knowingly.                              |
| Speech (TTS/STT)           | Off unless configured            | `SPEECH_PROVIDER=elevenlabs` leaves the network. The OpenAI path routes through LiteLLM when `LITELLM_PROXY_URL` is set, so it can be served locally.  |
| Mail                       | Optional                         | Point `SMTP_HOST` at an internal server, or set `MAIL_PROVIDER=console` and hand out credentials out of band.                                          |
| LiteLLM → Langfuse tracing | Only with `LANGFUSE_*` set       | Leave those unset, or point them at a self-hosted Langfuse.                                                                                            |
| Container images           | Install-time                     | Pull once, then mirror to an internal registry and cut outbound traffic.                                                                               |

Ragen itself has no analytics, tag manager or product telemetry, and nothing
reports back to the vendor. See [Security and privacy](/docs/security) for how
that is enforced rather than merely stated.

If you keep moderation on, `IS_ON_PREMISE=1` makes it respect each
organization's own toggle instead of forcing it for everyone.

## Things that break differently on a local model

- **Structured output.** Multi-query expansion asks the model for a JSON object
  against a schema. vLLM constrains generation to a schema natively; Ollama
  supports `response_format`, but coverage varies by model and version. A
  failure here does not error — it falls back to searching the user's raw
  question, so a follow-up like "and what about the second one?" is retrieved
  literally, with no history behind it. It is silent apart from a log line:
  grep for `Rephrase-and-expand failed` after switching models.
- **Tool calling.** MCP connectors and built-in tools need a model that supports
  function calling. Many open models do; some do not, and the tools simply never
  fire.
- **Vision.** A text-only local model cannot read an attached image. Set
  `MULTIMODAL_TEXT_ONLY_MODELS` to its ID and `MULTIMODAL_FALLBACK_MODEL` to a
  vision-capable one, and Ragen swaps models when a request carries an image.
- **Context length.** RAG prompts are long — the question, the history and
  several retrieved chunks. A short-context model either rejects the request or
  drops the earliest part of it, which reads as "the answer ignored my
  document".

## Measure before you commit

Locally served open models generally answer less well than the large commercial
ones. How much less depends entirely on your documents and your questions, so
measure it on your own material instead of taking anyone's word — including
ours.

The eval suite compares models over the same questions:

```bash
npm run eval:models --workspace=@webamigos/ragen-web
```

Add your local model to the `providers` list in
`apps/web/evals/configs/model-comparison.yaml` beside the model you use today,
and put your own questions in the matching dataset — the stock ones say nothing
about your corpus. The chain under test and the grader both go through LiteLLM,
so the run needs no provider key of its own; on an isolated install, repoint the
grader in `defaultTest` at a local model too.

## Verifying an isolated install

```bash
curl http://localhost:4000/v1/models          # the proxy serves your local IDs
curl http://localhost:8000/v1/models          # the model server is up
curl http://localhost:6333/collections        # Qdrant is up
```

Then ask one question in the UI and one document through ingest, and watch the
model server's log. If it shows a request for the answer, one for the rephrase
and a batch of embeddings for the document, the four paths are all local. If the
rephrase never arrives, `REPHRASE_MODEL` is still pointing at a cloud model.
