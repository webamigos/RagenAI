---
title: A model chosen by message content cannot be chosen where the model is built
modules: [web, api, worker]
areas: [architecture, rag]
topics:
  [ai-sdk, llm-gateway, litellm, multimodal, provider-abstraction, seams]
---

## Context

Phase B of the LiteLLM retirement moves the proxy's data plane into
`packages/llm-gateway`. B1 ported two behaviours out of
`chat-completion-factory.ts`, where both lived inside a `fetch` hook that parsed
the outgoing `/chat/completions` body and rewrote it:

- swapping a text-only model for a vision-capable one when the turn carries
  images,
- injecting `reasoning_effort` for models that accept it.

B1 re-described the first correctly: it is not a request rewrite, it is **model
selection**, so it belongs before the model is resolved rather than after the
request has been serialised. That reading is right, and it is why the port was
possible at all — with native Azure, Bedrock and Vertex providers there is no
shared wire format left to rewrite.

## Problem

"Before the model is resolved" turned out not to name a place that exists.

The application's seam is `createChatCompletionInstance(options)`. It is handed
a model id, a temperature and a reasoning effort — and **no messages**. Messages
arrive later, at `streamText`/`generateText`, by which point the model object
has long been built and handed to a chain. So the swap had nowhere to run: too
late inside the provider (no common wire format), too early at the factory (no
content to inspect).

The proxy had hidden this. A `fetch` hook is the one point where both facts are
present at once — the chosen model and the serialised messages — and it only
worked because every call went to one OpenAI-compatible endpoint. Removing the
proxy did not just remove a hop; it removed the only place the decision had
been expressible.

Threading the prompt back through every caller would have worked and would have
been wrong: seven call sites, each rewritten to pass content they do not
otherwise care about, to serve a swap that fires for a small fraction of turns.

## Rule

**When a choice depends on data the seam does not receive, defer the choice, not
the data.** A `LanguageModelV4` is an interface, so an implementation can resolve
its real upstream inside `doGenerate`/`doStream`, where the prompt is — and stay
synchronous to construct, so no caller changes.

Deferring paid a second debt for free: `resolveModel` is async (credentials come
from a `CredentialSource` that will be the token vault), while the factory is
synchronous. Resolving at call time made that mismatch disappear rather than
propagate `async` through seven files.

Two things to get right in such a model:

- **Cache per resolved id, and evict on failure.** A chain holds one instance
  for its lifetime, so re-resolving rebuilds a provider client per turn; but
  caching a rejection turns a briefly unreachable credential source into a
  permanent failure.
- **Answer `modelId` with what was asked for, not what was called.** One
  instance may legitimately call two upstreams across a conversation.

A related trap the same port surfaced: **two apps carried opposite workarounds
for the same field.** apps/web deleted `encoding_format` from every embedding
request (a LiteLLM/Bedrock-Cohere bug) and apps/worker forced it to `float`
(Scaleway's vLLM rejects it missing). Both were the proxy's, both were invisible
from the other's side, and the native provider sends `float` anyway. When
removing an intermediary, grep every app for hooks that patch the same request —
contradictory ones mean the intermediary, not the upstream, was the audience.

## Applies to

Any seam that builds a provider client from configuration and is then used with
data it never saw — model selection by content, per-request routing, or
credential scoping that depends on the call rather than the caller. Concretely:
`packages/llm-gateway/src/native-chat-model.ts`, and B2b when `apps/api` and
`apps/worker` repeat the exercise.
