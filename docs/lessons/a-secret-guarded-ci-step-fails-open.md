---
title: 'An `if: secret != ""` guard on a CI step fails open — the gate reports success without ever running'
modules: ['web']
areas: ['ci']
topics: ['github-actions', 'secrets', 'evals', 'fail-open']
---

# An `if: secret != ""` guard on a CI step fails open — the gate reports success without ever running

**Context**: `.github/workflows/evals.yml` guards its one substantive step with `if: env.LITELLM_PROXY_URL != '' && env.LITELLM_MASTER_KEY != ''`. The guard is deliberate and the comment above it explains why: fork PRs cannot read repository secrets, so the gate has to skip there rather than fail. Neither secret has ever existed on the repository — `gh secret list --repo WebAmigos/ragen` returns 25 secrets and none match `LITELLM*`.

**Problem**: on every PR, fork or not, the condition was false, the step was skipped, and the job went green after spending ~4 minutes on `npm ci` and `prisma generate`. Per-step conclusions show `Run CI evals` skipped as far back as the runs are worth reading, including on the branch literally named `fix/revive-promptfoo-evals` whose PR title was "make the promptfoo suites actually run and actually gate". A skipped step contributes nothing to the job's conclusion, so the check is a green tick and the PR summary shows a passing "Run CI Eval Gate" — indistinguishable, at the only level anyone looks at, from a gate that graded every prompt and liked the answers. This is the same fail-open class as [a stale path filter](path-filters-fail-open-after-a-directory-move.md) and it was hiding behind it: the path filter meant the workflow never triggered, and once triggering was fixed the secret guard meant it still never evaluated anything.

**Rule**: a `skip when unconfigured` guard is only honest when "unconfigured" is a state that legitimately occurs. Split the two cases: skip where the secret is genuinely unobtainable (a fork PR), and fail loudly everywhere else, in an explicit step whose whole job is to check presence and `exit 1` with the secret names and where to add them — cramming it into the existing `if:` just produces another silent skip. Two mechanical traps in that check: test `github.event.pull_request.head.repo.full_name == github.repository` rather than `head.repo.fork`, because that flag is true for *every* PR, internal ones included, once the repo itself is a fork of something upstream — which reinstates the always-skip bug; and keep the secrets in the **job**-level `env:` block, because a step's `if:` is evaluated before that step's own `env` exists, so step-level `env` makes the condition permanently false (an earlier version of this file had exactly that bug, and its comment says so).

**Rule for reading CI**: a green check is not evidence a gate ran. Only the per-step conclusions distinguish "ran and passed" from "skipped":

```bash
gh api repos/WebAmigos/ragen/actions/jobs/<job_id> -q '.steps[] | "\(.conclusion)\t\(.name)"'
```

**Applies to**: every workflow step gated on a secret or optional service being present — today the eval gate, and the same shape would appear in any future job wired to Langfuse, Scaleway rerank, AWS Bedrock, or a Stripe test key.
