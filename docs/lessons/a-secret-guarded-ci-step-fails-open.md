---
title: 'An `if: secret != ""` guard on a CI step fails open — and a gate nobody can run should be deleted, not repaired'
modules: ['web']
areas: ['ci']
topics: ['github-actions', 'secrets', 'evals', 'fail-open']
---

# An `if: secret != ""` guard on a CI step fails open — and a gate nobody can run should be deleted, not repaired

**Context**: `.github/workflows/evals.yml` ran a 5-case promptfoo suite against the RAG chain and guarded its one substantive step with `if: env.LITELLM_PROXY_URL != '' && env.LITELLM_MASTER_KEY != ''`. The guard was deliberate — fork PRs cannot read repository secrets, so the gate had to skip there rather than fail. But neither secret had ever existed on the repository: `gh secret list` returned 25 secrets and none matched `LITELLM*`.

**Problem**: on every PR, fork or not, the condition was false, the step was skipped, and the job went green after ~4 minutes of `npm ci` and `prisma generate`. A skipped step contributes nothing to the job's conclusion, so the PR summary showed a passing "Run CI Eval Gate" — indistinguishable, at the only level anyone looks at, from a gate that graded every prompt and liked the answers. Per-step conclusions showed `Run CI evals` skipped as far back as the runs were worth reading, including on a branch literally named `fix/revive-promptfoo-evals` whose PR title was "make the promptfoo suites actually run and actually gate". This is the same fail-open class as [a stale path filter](path-filters-fail-open-after-a-directory-move.md) and was hiding behind it: the path filter meant the workflow never triggered, and once triggering was fixed the secret guard meant it still evaluated nothing.

**What we did, and why not the obvious fix**: the first instinct was to make the missing secret fail loudly — skip only where secrets are genuinely unobtainable, fail everywhere else. That was built and verified on CI, and then abandoned, because pricing out the actual run showed the gate could not be made to work without a change nobody wanted:

- **It needs a publicly reachable LiteLLM proxy.** A GitHub-hosted runner cannot see `localhost:4000` or `litellm-proxy.railway.internal`, and the Railway service has no live public deployment. Giving it one puts an internet-facing LLM gateway holding the Azure, Bedrock and Vertex credentials in front of the world — a far larger exposure than the gate is worth.
- **It could never block a merge anyway.** `gh api repos/WebAmigos/ragen/branches/main/protection` returns 403 (*Upgrade to GitHub Pro or make this repository public*), so the repository has no required status checks. "Actually gate" was never achievable in CI on this plan; it is a billing question, not a workflow one.
- **It tested less than its name implied.** The provider injected `MockVectorStoreClient` with no-op embeddings and no-op moderation, so retrieval was a fixture. It checked chain wiring and one prompt-injection case, not retrieval quality — which per ADR-20 is measured by `eval:rag` and `eval:e2e-rag`, both manual.

So the workflow was deleted. The suites in `apps/web/evals/` and their npm scripts stay and still run locally; only the CI wrapper is gone.

**Rule**: a `skip when unconfigured` guard is only honest when "unconfigured" is a state that legitimately occurs. If a required secret has never existed, the guard is not a graceful degradation — it is a permanently green no-op. When you find one, price the working version before repairing it: a gate whose dependency cannot be reached from CI, or that cannot block anything, is worth less than the false assurance it emits, and deleting it is the honest outcome. Never leave the third option — a check that stays green because it does nothing.

**Rule for reading CI**: a green check is not evidence a gate ran. Only the per-step conclusions distinguish "ran and passed" from "skipped":

```bash
gh api repos/WebAmigos/ragen/actions/jobs/<job_id> -q '.steps[] | "\(.conclusion)\t\(.name)"'
```

**If a secret-gated job is ever added back**, three mechanical traps: test `github.event.pull_request.head.repo.full_name == github.repository` rather than `head.repo.fork`, because that flag is true for *every* PR, internal ones included, once the repo itself is a fork of something upstream; exempt Dependabot, whose `pull_request` runs read the *Dependabot* secret store rather than the Actions one, so `secrets.*` is empty there even when the secrets exist; and keep the secrets in the **job**-level `env:` block, because a step's `if:` is evaluated before that step's own `env` exists, so step-level `env` makes the condition permanently false.

**Applies to**: any future job wired to Langfuse, Scaleway rerank, AWS Bedrock or a Stripe test key — and to `apps/web/evals/` itself, if someone later wants it in CI, which needs a self-hosted runner or a `workflow_dispatch` job on the private network rather than a public proxy.
