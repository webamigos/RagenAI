---
title: A flag set on a deployment whose build predates its consumer is inert, and the deployment reports nothing
modules: [web, api, worker]
areas: [architecture, deployment, observability]
topics:
  [llm-gateway, feature-flags, railway, healthcheck, measurement, fail-open, unpushed-commits]
---

## Context

B4 of the LiteLLM retirement is an observation week: put the demo environment on
the native gateway path, leave it a week, watch for 5xx on chat and ingest. The
flip is one variable, `LLM_GATEWAY=native`, and B2c had already anticipated the
way such a measurement goes wrong — a run stamped `native` that the app actually
served through the proxy — by having `/api/healthcheck` report the mode from
*inside* the process rather than from the harness's own environment. The comment
on that route says so explicitly: a benchmark that recorded what it was told
would happily stamp `native` on a proxy run, and both arms would still look like
plausible numbers.

The variable was set on demo on 2026-09-15. A deploy ran. The week was recorded
as started.

## Problem

Demo had been serving every request through LiteLLM the entire time, labelled
`native`.

The seam that reads `LLM_GATEWAY` lives on `feat/llm-gateway-b2-the-seam`, and
that branch had not been pushed — nine of its eleven commits existed only on one
laptop. Demo builds `main`, and on `main` the only non-locale reference to
`@ragenai/llm-gateway` is the setup page's `inspect-environment.ts`. Nothing on
that branch routes a model call. So the variable was read by no one, defaulted to
nothing, and changed no behaviour.

Every surface that could have said so was silent. Railway showed
`LLM_GATEWAY=native` on the service, correctly — it *is* set. The deploy
succeeded, because an unread variable breaks no build. There was a recent
deployment, eighteen hours old, which made the environment look freshly flipped;
it had in fact built `main` at a commit that predated even B1. Nothing warns that
an environment variable matches no reader.

The guard that was supposed to catch exactly this could not, because it shipped
in the same unmerged branch as the thing it guards. `/api/healthcheck` on demo
returned:

```
{"status":"ok"}
```

Not `{"llmGateway":"litellm"}` — no `llmGateway` key at all. The field is added
by the same commit (B2c) that adds the seam, so wherever the seam is missing, so
is the evidence that it is missing. A verification built into the feature it
verifies proves nothing about a deployment that does not have the feature.

The second trap is in how that response reads. An absent key looks like a smaller
problem than a wrong value — a serialisation quirk, an older field ordering — and
the instinct is to reach for the default. Here the absence *was* the whole
finding: it dates the build, and it dates it earlier than the flag.

## Rule

**A flag is not a flag until something reads it. Confirm the reader is deployed,
not just that the variable is set.**

- Before counting day one of any measurement, ask the running deployment what
  mode it is in and require a **positive** answer. `{"llmGateway":"native"}` is
  the only response that starts the clock; `{"llmGateway":"litellm"}` means not
  yet flipped; a **missing key means the build predates the consumer**, which is
  the most alarming of the three and the easiest to skim past. Never read an
  absent field as a default.
- A self-report shipped in the same commit as the behaviour it reports cannot
  detect that commit's absence. Its useful signal is not its value but whether
  the field exists at all — so treat schema presence as the version check, and
  know which commit introduced it.
- A recent deploy is not evidence that recent work is deployed. `git ls-remote`
  the branch before believing an environment could have built it; commits that
  never left a laptop cannot be in any image, however new the image is.
- When verifying against a deployed environment's variables, do not let the local
  `.env.local` into the run. `npm run gateway:preflight` passes
  `--env-file-if-exists=.env.local`; real env vars do win over that file, but a
  variable the file sets and the environment does not still leaks in — a local
  `LITELLM_PROXY_URL=http://localhost:4000` is exactly the kind that makes a
  remote probe lie. Invoke the script directly instead:
  `railway run --service ragen-app -- node --import tsx scripts/gateway-preflight.mts --probe`.

This is the deployment-side spelling of
[a limit that is computed is not a limit](a-provider-package-is-not-configured-until-something-calls-it.md)'s
sibling rule in `AGENTS.md` — a limit is a call site. So is a flag.

## Applies to

Any environment-variable flag whose reader ships in application code: the
`LLM_GATEWAY` and `RERANK_SEAM` seams, `DOCUMENT_PARSER`, `STORAGE_PROVIDER`, and
every future selector from the pluggable-infrastructure programme. Sharpest
wherever a flag is set on a long-lived environment ahead of the branch that
teaches the app to read it, and wherever a measurement's validity depends on
which path actually served the traffic.
