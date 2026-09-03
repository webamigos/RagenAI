# ADR-33: Share the Platform Contracts Across the Apps

**Status:** Accepted and implemented.
**Date:** 2026-09-02

## Context

ADR-26, ADR-27 and ADR-28 collapsed the vector contract, the storage
abstraction and the observability helpers into shared packages. What remained
was a different kind of duplicate: not helper *code*, but **values two apps have
to resolve identically** — a list of feature flags, a catalogue of model IDs, a
map of tenant-scoped models. Each copy carried a comment asking the next reader
to keep it in sync.

| Contract | Copies | Where |
|---|---|---|
| `FEATURE_KEYS` / `DEFAULT_FEATURES` / `FEATURE_LABELS` | **3** | `apps/web/src/features/subscriptions/contracts/features.types.ts`, `apps/api/src/subscriptions/types.ts`, `apps/admin/.../features/feature-keys.ts` |
| `MODEL_REGISTRY` | **2**, plus a third divergent list | `apps/web/src/libs/llm/model-registry.ts`, `apps/api/src/llm/model-registry.ts`, and `apps/admin/.../models/models-config.ts` |
| MCP connector labels and icon paths | **2** | `apps/web/.../connectors/utils/provider-icons.ts`, `apps/admin/.../connectors/connectors-config.ts` |
| `TENANT_SCOPED_MODELS` + `isTenantScopeSatisfied` | **2** | `apps/web/src/libs/db/tenant-scope-guard.ts`, `apps/api/src/prisma/tenant-scope-guard.ts` |

Two architecture tests existed precisely because typecheck cannot see this class
of drift: every copy derives its own `FeatureKey` union from its own array, so
all three stay internally consistent while disagreeing with each other.

**The tests were not enough, because they only covered what someone thought to
compare.** An audit of `apps/admin` found the model list had drifted past
membership into *namespace*:

| admin offered | what LiteLLM actually serves |
|---|---|
| `openai/gpt-5.3-chat` | `gpt-5.3-chat` |
| `anthropic/claude-sonnet-4.6` | `claude-sonnet-4-6` |
| `openai/gpt-5.2` | *did not exist anywhere* |
| — | `gpt-5.4`, `gpt-oss-120b`, `mistral-small-3.2` — not offerable at all |

The consumer is a membership test:

```ts
if (allowedModels.length > 0) {
  models = models.filter((model) => allowedModels.includes(model.value));
}
```

`model.value` is LiteLLM's own `id`. A value that matches nothing does not
*narrow* the list — it **empties** it. Restricting an organization's models from
the admin panel left that organization with no selectable model at all, and the
non-existent IDs were then POSTed to LiteLLM's `/team/update`, whose response
the caller discards. Lint, typecheck, every unit test and every migration
passed throughout.

The prevailing convention, stated in ADR-22, ADR-23 and `apps/api/AGENTS.md`,
was that small duplicated files are acceptable. That convention was written for
*helpers* whose divergence is visible when it happens. It does not hold for
values, whose divergence is visible only in a third place, at runtime, to a
customer.

## Decision

**`packages/platform-contracts`**, on the same model as `packages/observability`:
a CommonJS build with declarations, so a `tsc --build` → plain-node consumer
(apps/api) can use it alongside two Next.js apps.

Four modules, one barrel:

- `llm/model-catalog` — `MODEL_REGISTRY`, its types, `selectableModels()`,
  `isReasoningModel()`, `supportsReasoningEffort()`, `normalizeModelId()`
- `features/features` — `FEATURE_KEYS`, `DEFAULT_FEATURES`, `FEATURE_LABELS`,
  `sanitizeFeatureOverrides()`
- `connectors/connectors` — `CONNECTOR_PROVIDERS`, per-provider label and icon,
  `isConnectorProvider()`
- `tenant-scope/tenant-scope` — `TENANT_SCOPED_MODELS`,
  `isTenantScopeSatisfied()`

Each app keeps a re-export or a thin binding, so **no import site changed**:
`@/libs/llm/model-registry` still resolves, `../llm/model-registry.js` still
resolves, and roughly forty call sites were untouched.

### What deliberately stays out

- **Which models a deployment serves.** That is `infra/litellm/config.yaml`,
  read at runtime from the proxy's `/v1/models`. The package holds only how a
  model is *presented* — label, grouping, visibility. Putting the served list in
  a package would recreate the same drift one level up.
- **`Prisma.defineExtension`.** It needs a *generated* client, and web and api
  each generate their own from the shared schema. The package owns the model map
  and the predicate; each app wraps them in its own extension with its own
  logger. This is the split that matters — the two guard files were identical
  but for the import, the logger and the comments, and the model map was the
  half that actually had to agree.
- **Anything reading an app's environment.** A contract that varies per
  deployment is configuration, not a contract.

### Why a package and not a root config file

A `ragen.config.ts` at the repository root would still be a TypeScript module
each workspace imports — a package with the parts removed that make a package
work. It would have no node in the dependency graph, so Turborepo could neither
cache it nor order builds against it, and each app's bundler would have to reach
outside its own root, which is exactly the pattern these ADRs keep removing.
`next.config.ts` and `turbo.json` configure a *build*; `.env.local` configures a
*runtime*; this is neither.

### The invariant changed shape

`tests/architecture/feature-keys-agree.test.ts` and
`tenant-scope-guards-agree.test.ts` are deleted. They asserted that copies
matched; there are no copies. They are replaced by
`tests/architecture/shared-contracts-are-not-recopied.test.ts`, which fails if
any app declares one of these contracts again — the thing someone reaches for
when a cross-workspace import feels awkward, and how the drift started.

Both deleted tests failed loudly and correctly when their subjects disappeared,
including the "if it was renamed or reshaped, update this guard — do not delete
it" message. That message is right in general; this is the exception it was
written to make someone stop and think about.

## Consequences

- One declaration of each contract. `apps/admin` no longer reaches into
  `apps/web` by relative path for the model registry.
- **`apps/web`'s connector binding now typechecks the package against the
  schema.** `Record<McpConnectorProvider, string> = CONNECTOR_ICON_PATHS` fails
  compilation if the package is missing a provider the Prisma enum has — a
  guarantee neither copy had before. The other direction (an extra key in the
  package) is covered by the package's own test against `schema.prisma`.
- The package tests check each contract against its **real** source of truth
  rather than against another copy: connectors and the tenant-scope map against
  `prisma/schema.prisma`, the model catalogue against
  `infra/litellm/config.yaml`. That is strictly stronger than agreement between
  two hand-written lists, both of which can be wrong together.
- `apps/api/docs/ported-libs.md` shrinks by two entries. `ai-pricing.ts` and the
  organization contract types are still duplicated — they were out of scope here
  and are the obvious next candidates.
- Stored data is not migrated by this change.
  `apps/web/src/scripts/normalize-allowed-models.ts` repairs
  `allowedModels` rows written by the old admin list; run it with `--dry-run`
  first.

## Alternatives considered

**Keep the copies, add more architecture tests.** This was the status quo, and
it is what failed: the tests covered the feature keys and the tenant map, and
the model list drifted anyway because nobody had written that particular
comparison. A test per duplicate scales worse than removing the duplicates.

**Move only the model catalogue.** Smaller and lower-risk, and it would have
fixed the live defect. Rejected because the remaining three duplicates have the
same failure mode and the same fix, and doing them separately means three
rounds of adding a dependency, wiring bindings and re-running the gate for no
additional safety.

**Publish to a registry.** No — it is private, versionless and consumed only
inside this monorepo, exactly like the other five packages.
