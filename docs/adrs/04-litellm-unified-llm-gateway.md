# ADR-04: LiteLLM as Unified LLM Gateway

**Status:** Accepted
**Date:** 2025-01-01

## Context

The application needs to support multiple LLM providers (Azure OpenAI, AWS Bedrock, Google Vertex AI) for chat completions and embeddings. Direct integration with each provider SDK would mean maintaining multiple client libraries, authentication methods, and API variations.

## Options Considered

1. **Direct provider SDKs** — separate `@azure/openai`, `@aws-sdk/bedrock-runtime`, `@google-cloud/vertexai` clients
2. **LiteLLM proxy** — single OpenAI-compatible API that routes to underlying providers

## Decision

**LiteLLM proxy** deployed as a separate service (Docker container, Railway in production).

**Architecture:** ragen-app → `@ai-sdk/openai` (`.chat()`) → LiteLLM (`/v1/chat/completions`) → Azure/Bedrock/Vertex

**Rationale:**
- Single client library (`@ai-sdk/openai`) for all providers
- Model management via LiteLLM config/UI without app code changes
- Built-in Langfuse tracing for all LLM calls (success/failure callbacks)
- Provider failover and load balancing at the proxy level
- Per-organization model restrictions via `allowedModels` filtered against LiteLLM's `/v1/models`

## Configuration

- Models defined in `litellm/config.yaml` (baked into Docker image)
- Provider credentials set as environment variables on the LiteLLM container
- App only needs `LITELLM_PROXY_URL` and `LITELLM_MASTER_KEY`

## Consequences

- Extra network hop for every LLM call (minimal latency impact — proxy runs in same region)
- LiteLLM becomes a critical dependency — if the proxy is down, no AI features work
- Model naming must match between `litellm/config.yaml` and app code
- Langfuse tracing for LLM calls is handled entirely by LiteLLM, not by ragen-app's OTel pipeline
