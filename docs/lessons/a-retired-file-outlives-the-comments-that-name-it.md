---
title: 'A retired file outlives the comments that name it, and the entry-point comment is the worst place for that'
modules: ['env', 'platform-contracts', 'web', 'api', 'worker']
areas: ['architecture', 'documentation']
topics:
  ['adr-49', 'llm-gateway', 'litellm', 'stale-pointers', 'architecture-tests']
---

# A retired file outlives the comments that name it, and the entry-point comment is the worst place for that

**Context**: B6 of the LiteLLM retirement ([ADR-49](../adrs/49-the-application-calls-model-providers-itself.md))
deleted `infra/litellm/config.yaml` along with the proxy that read it. The route
table `infra/llm-gateway/routes.yaml` took over as the source of truth for which
models exist, and `AGENTS.md` says so in as many words.

**Problem**: the deletion was complete in the code and nowhere else. A week
later, thirty-odd files still named the deleted path, and one of them mattered
more than the rest: the doc comment on the `models` fragment in
`packages/env/src/fragments.ts`, which is the documented entry point for
"adding a model". It read

> The catalogue lives in `infra/litellm/config.yaml` and
> `@ragenai/platform-contracts`

so someone provisioning a model started at exactly the wrong file.

Three things made it survive. Nothing resolves a path inside a comment, so
every static check stayed green. The file still existed on developer machines
as an untracked build leftover, so the reader's first check — does this file
exist? — confirmed the wrong answer. And the failure is downstream and mute: a
model id with no route does not error at edit time, it resolves to nothing at
the first call.

The same residue had spread into claims that were simply false by then —
`docs/document-processing.md` said `claude-haiku-4-5` was commented out and
would 404 (it has a route), `docs/rag-pipeline.md` told you to uncomment a
rerank entry in a deleted file, an architecture test's failure message cited
`./infra/litellm` as a path `docker-compose.yml` mounts, and
`infra/llm-gateway/README.md` still documented a `LLM_GATEWAY` flag B6 removed.
Each one reads as instruction, and each sends its reader somewhere that cannot
be edited into an effect.

**Rule**: **a path a file names is a path that exists.** Deleting a file is not
done until the pointers to it are settled, and the pointer in the *entry-point*
comment is the one to settle first — it is read by the person least able to
notice it is wrong.

Settle each one in one of three ways: point it at what replaced the file; say
plainly that the file is retired, when explaining the retirement is the text's
job; or leave it alone when the text is a dated record (an ADR, a spec, a
lesson, the changelog) that would be falsified by an update.

`tests/architecture/an-infra-path-that-is-cited-exists.test.ts` enforces the
mechanical half for `infra/` — the half that was missed. It exempts the dated
records and carries a short, named list of files whose job is to explain a
retirement. It cannot judge whether prose is current; it can say that a path is
not there, which is what nobody was in a position to notice.

The companion rule for directories: a directory that nothing reads either goes
with the code that read it, or carries a README saying why it stays. `infra/`'s
two leftovers split on exactly that test — `infra/litellm/` had no second half
left in the tree and went; `infra/temporal/` is the server config for a runtime
`apps/worker` still ships and CI still runs parity over, so it stays with a
header.

**Applies to**: any deletion that removes a file other files talk about —
config, infra directories, env vars, packages. #1134 describes the same shape in
`.env.example`, and `an-adr-reference-resolves.test.ts` is the same rule applied
to citations of records rather than of paths.
