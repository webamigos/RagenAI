---
title: Guardrails, authored and applied from the admin panel
status: draft
areas: [admin, chat, api, security, worker]
adrs: [33, 35, 37, 39, 42]
---

# Guardrails, authored and applied from the admin panel

## TLDR

A platform administrator gets one page in `apps/admin` where they author the
rules that a chat turn has to pass — built-in ones (content moderation,
jailbreak detection) and ones they write themselves (a pattern, or a policy in
plain language judged by a model) — set per rule whether a hit blocks, masks or
is only logged, and override any of it for a single organization. The rules run
on both sides of the turn and on every chat surface. The non-obvious part is
the output side: a pattern rule streams through a sliding window and costs
nothing, while a model-judged output rule cannot stream at all, so the kind of
rule an operator picks decides whether that organization's answers still appear
word by word.

## What already exists

This is not a green field. Four checks run on a chat turn today, and each was
wired separately:

| Check | Where | Controlled by | Blocks? |
|---|---|---|---|
| OpenAI content moderation | `basic-rag/chain.ts`, `conversation-chain/chain.ts` (web) and `apps/api/src/chains/basic-rag/chain.ts` | `MODERATION_ENABLED=1` env, **and** `OrganizationSettings.contentModerationEnabled` when `IS_ON_PREMISE` | yes — throws `ModerationError` |
| Jailbreak classifier | `src/libs/security/jailbreak-classifier.ts`, called from `assistant-stream.ts` and the chatbot route | `JAILBREAK_DETECTION_ENABLED` + `JAILBREAK_DETECTION_THRESHOLD` env | no — telemetry only |
| Tool-call gating / arg inspection | `src/libs/security/tool-gating-context.ts`, `tool-arg-inspector.ts`, duplicated in `apps/api/src/security/` | code constants | yes, by pausing for approval |
| PII policy | `src/libs/pii/`, `UserFile.piiPolicy`, `DocumentFolder.piiPolicy`, `OrganizationSettings.piiIngestionMode` | per file/folder/org | masks |

Three facts about that table shape this spec.

**An operator has four places to look and two of them are environment
variables.** `MODERATION_ENABLED` is a process-level kill switch; the per-org
toggle beneath it is only consulted on-premise, and the panel that shows it
(`organization/rag-settings`) is read-only, because ADR-35 puts the editing in
`apps/admin`. So today a platform administrator can turn moderation on for one
organization from `/rag-settings` — and it still does nothing unless an
environment variable was set at deploy time. That is the gap this closes.

**The chains are duplicated, not shared.** `apps/web/src/libs/chains/` and
`apps/api/src/chains/` hold two copies of the same pipeline, and
`apps/web/src/libs/security/` and `apps/api/src/security/` hold two copies of
the security helpers (`pii-scrubber`, `escalation-rules`, `tool-arg-inspector`,
`tool-gating-context` — each present twice). Anything added at the call-site
level has to be added twice or it silently protects one surface and not the
other. `packages/rag-core` exists but holds only the vector and embedding
contracts; it is not where chain behaviour lives.

**Severity and escalation are already solved.** `recordSecurityEvent` scrubs
PII, applies burst escalation, writes `security_events` and emails on
`critical`. Guardrails should produce events through it, not invent a second
audit path.

## Problem

Today an operator running one Ragen installation for several client
organizations cannot answer "what is this assistant not allowed to say, and to
whom", and cannot change the answer without a deploy.

Concretely, none of these is possible:

- Turn content moderation on for one client and off for another, without
  setting an environment variable that applies to the whole process.
- Add a rule of their own — "never discuss a competitor's pricing", "refuse
  anything that looks like a national ID number", "this tenant's assistant
  answers only about their product catalogue" — at all, in any form.
- Run a new rule in observation mode to see how often it would have fired,
  before letting it block a customer's message.
- See, in one place, how often anything was blocked and what was in it.

The evidence that this is a gap rather than a preference: the jailbreak
classifier's own file says it is "telemetry, not defense" and that shipping it
off by default was to validate cost and latency "against real traffic" — the
observation-mode need, solved once, in code, for one detector, and unavailable
to anything else. And `docs/security-monitoring.md` documents tuning
thresholds by editing `src/libs/security/tool-arg-inspector.ts`, which is a
deploy.

## Out of scope

- **PII masking stays where it is.** `PiiPolicy` is set per file and per
  folder and is applied at ingest by the worker as well as in chat; folding it
  into a chat-turn rule engine would mean redesigning the ingest path. The
  guardrails page links to the PII policy pages; it does not own them.
- **Tool-call gating and tool-arg inspection stay where they are.** They act on
  a tool call's arguments mid-stream, not on the turn's text, and they already
  have a working approval UI. They are a candidate for a later phase, named in
  "Later, deliberately not now".
- **Retrieved chunks are not inspected.** Scanning knowledge-base content
  before it reaches the prompt touches retrieval, which under ADR-20 means a
  measurement round; that is its own spec.
- **No per-user or per-project scoping.** Rules are platform-wide or
  per-organization. A rule that applies only to one project is a fourth layer
  nobody has asked for.
- **Org admins do not author rules.** Consistent with ADR-35, `apps/web` shows
  an organization which guardrails apply to it, read-only, the way
  `organization/rag-settings` already shows the pipeline toggles.
- **No versioning or scheduled activation of rules.** A rule is edited in
  place; the audit log records who changed what.

## Proposed solution

### One package, two call sites per app

A new workspace package, **`packages/guardrails`**, owns the vocabulary, the
resolution rules and the evaluators. It has no Prisma, Next, provider-SDK or
`server-only` import: rows arrive as plain objects and the model calls arrive as
injected functions. That is the shape `tenant-scope` already uses in
`packages/platform-contracts` — the package holds the part with no Prisma
dependency, and each app keeps a thin binding.

It is a new package rather than a folder in `platform-contracts` because it
carries runtime evaluators (regex execution, a judge prompt, a sliding-window
stream transform) and `platform-contracts` is deliberately a contracts package.
It is not `rag-core` because guardrails apply to the conversation chain too,
which does no retrieval.

Rejected alternatives:

- **Put the logic in `apps/web` and have `apps/api` call it over the internal
  API.** `apps/api` already calls `apps/web`'s `/api/v1/*` behind
  `INTERNAL_API_SECRET`, so this is not unprecedented. Rejected because it puts
  a network hop inside the hot path of every turn on the public API, and a
  guardrail that fails when the web app is redeploying is worse than one that
  does not exist.
- **Duplicate it, like the security helpers already are.** Rejected on the
  evidence in this repo: `pii-scrubber`, `escalation-rules` and
  `tool-gating-context` each exist twice, and the third copy of what became
  `platform-contracts` is what ADR-33 was written about. An architecture test
  (`guardrails-are-not-recopied.test.ts`) locks this.

### What a rule is

Three kinds, one table, one evaluation loop:

| Kind | What it matches | Cost | Valid actions |
|---|---|---|---|
| `BUILT_IN` | a named detector in code (`content-moderation`, `jailbreak-detection`) | one provider call | `BLOCK`, `LOG` |
| `PATTERN` | a literal or a regex over the text | microseconds, no I/O | `BLOCK`, `MASK`, `LOG` |
| `LLM_POLICY` | a policy written in prose, scored 0–1 by a judge model | one model call per turn per rule | `BLOCK`, `LOG` |

`MASK` is rejected at save time for `BUILT_IN` and `LLM_POLICY`: neither returns
a span, so there is nothing to replace, and an action that silently degrades to
"block" is the kind of thing that gets discovered in production.

Each rule also carries a `stage` (`INPUT`, `OUTPUT` or `BOTH`), an `enabled`
flag, a `severity` for the security event it writes, and — for
`LLM_POLICY` and scored built-ins — a `threshold`.

The catalogue of built-ins lives in the package as a frozen array with labels,
exactly as `FEATURE_KEYS` / `FEATURE_LABELS` do, so the admin panel and the
runtime cannot disagree about what `jailbreak-detection` is called or what it
does.

### How a rule reaches an organization

Two tables, mirroring the tri-state inheritance that feature flags already use:

- A **`Guardrail`** row with `organizationId = null` is a platform rule: it
  applies to every organization.
- A **`Guardrail`** row with an `organizationId` is that organization's own
  rule, and applies only there.
- A **`GuardrailOrgOverride`** row adjusts a platform rule for one
  organization. Every field on it is nullable, and null means inherit.

Effective rule set for an organization = (platform rules, with overrides
applied) ∪ (that organization's own rules). The resolution is a pure function in
the package, with the layer that decided each value returned alongside it —
the same `FeatureSource` idea, for the same reason: an operator who cannot see
*why* a rule is on is not in control of it.

Rejected alternative: a JSON blob on `OrganizationSettings`, like
`featureOverrides`. That works for ten booleans. It does not work for rules an
operator creates and deletes, because there is no row to audit, no id to put in
a security event's metadata, and no way to ask "which organizations does this
rule apply to".

### Where it runs

**Input** — replacing the current `moderateContent()` call, at three call
sites:

- `apps/web/src/libs/chains/basic-rag/chain.ts`
- `apps/web/src/libs/chains/conversation-chain/chain.ts`
- `apps/api/src/chains/basic-rag/chain.ts`

This is the whole of the input side, because every chat surface funnels through
one of those three: `/api/threads` (authenticated chat) and
`/api/guest-threads/…` and `/api/chatbot/[token]/chat` (public widget) all
build a web chain; `apps/api`'s `/chat` and `/chat-completions` build the API
one. A fourth call site is not needed and would be a place for the behaviour to
drift.

The evaluation runs concurrently with `rephraseAndExpand`, as moderation does
today — a blocking check that costs a round trip should not also cost a
sequential one.

**Output** — in the stream funnel, `mapFullStream` in
`apps/web/src/libs/chains/utils/stream-mapper.ts` and its counterpart in
`apps/api`. Every `text-delta` the user ever sees passes through it.

Two behaviours, and the difference is the thing to get right:

- A `PATTERN` output rule runs on a **sliding window**. Deltas are emitted as
  they arrive except for the last `WINDOW` characters (256), held back so a
  match spanning a chunk boundary is still caught. Streaming is preserved; the
  answer appears a fraction of a token behind.
- An `LLM_POLICY` output rule **cannot stream**. The judge needs the finished
  answer, so the stream is buffered and released only after the verdict. The
  admin UI states this on the rule form, next to the toggle, in words: *"Output
  policies judged by a model delay the whole answer — it appears at once
  instead of word by word."* An operator who turns one on without being told
  that will report it as a performance bug.

An organization with no output rules pays nothing: the funnel returns the
original iterator unwrapped.

### What a hit does

- `LOG` — a security event, the turn proceeds. This is observation mode, and it
  is the default for every rule on creation. A rule that starts by blocking is
  a rule whose false-positive rate nobody measured.
- `MASK` — the matched span is replaced with a placeholder before the text
  moves on, plus the event.
- `BLOCK` on input — a `GuardrailError` (a `ChainError` with code
  `guardrail-blocked`), surfaced to the user through the existing chain-error
  path, in their locale. No model call is made.
- `BLOCK` on output — the stream stops, a `guardrail-violation` part is
  emitted, and what is persisted as the assistant message is the refusal, not
  the withheld text. It goes through the same encryption function as every
  other thread-derived write (ADR-42): a second branch that writes a refusal in
  clear text is exactly the failure that ADR was written about.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | two models, four enums, two enum members added to `SecurityEventType`, one to `AiUsageStep` | migration + `npm run verify`; the rolling-deploy hazard below |
| `packages/guardrails` (new) | the whole capability | its own unit tests; consumers web / api / admin build |
| `packages/platform-contracts` | `TENANT_SCOPED_MODELS` gains `Guardrail` and `GuardrailOrgOverride` | `tests/architecture/`, `provider-fragments-carry-their-rules.test.ts` neighbours |
| `apps/web/src/libs/chains/**` | two input call sites, one stream funnel | chain unit tests + `p0` e2e |
| `apps/api/src/chains/**` | one input call site, one stream funnel | api spec suite |
| `apps/admin` server actions | new `/guardrails` page and its actions | `server-actions-are-guarded` test |
| `apps/web/src/app/messages/*.json` | one new error key in 15 locale files | `npm run web:build`; see the note below |
| `packages/create-ragen-app` | `GUARDRAILS_DISABLED` documented; no new required variable | `create-ragen-app-manifest-is-current.test.ts` |
| `packages/env` | one optional boolean fragment | package tests + each app's env schema test |

Two of those rows carry a known trap.

**Locale JSON is the conflict point.** Fifteen message files gain
`guardrail-blocked` next to the existing `moderation-error`. If this work is
ever split across branches, regenerate the files from `main` plus a key list
rather than resolving them by hand.

**A new `SecurityEventType` member breaks older readers.** Three separately
generated Prisma clients read `security_events`, and the services deploy
independently — see
[`docs/lessons/adding-an-enum-value-breaks-older-readers.md`](../lessons/adding-an-enum-value-breaks-older-readers.md).
The migration that adds `GUARDRAIL_BLOCKED` / `GUARDRAIL_FLAGGED` must land and
every reader must be deployed **before** anything writes one. That is why the
enum members go in Phase A and the first writer in Phase B.

## Data model

```prisma
model Guardrail {
  id             Int             @id @default(autoincrement())
  publicId       String          @unique @default(uuid()) @map("public_id")
  /// null = a platform rule, applying to every organization.
  organizationId String?         @map("organization_id")
  /// Set for BUILT_IN rules ('content-moderation', 'jailbreak-detection'),
  /// null for operator-authored ones. Unique per scope so a platform rule and
  /// an organization's own rule cannot both claim the same detector.
  key            String?
  name           String
  description    String?
  kind           GuardrailKind
  stage          GuardrailStage
  action         GuardrailAction @default(LOG)
  enabled        Boolean         @default(true)
  severity       SecurityEventSeverity @default(warn)
  /// PATTERN only.
  pattern        String?
  patternIsRegex Boolean         @default(false) @map("pattern_is_regex")
  /// LLM_POLICY only — the prose the judge is given.
  policy         String?
  /// LLM_POLICY and scored built-ins. 0–1.
  threshold      Float?
  createdBy      String?         @map("created_by")
  createdAt      DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime        @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization?          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  overrides    GuardrailOrgOverride[]

  @@unique([organizationId, key])
  @@index([organizationId, enabled])
  @@map("guardrails")
}

/// An adjustment to a platform rule for one organization. Every field is
/// nullable and null means inherit — the same tri-state as FeatureOverrides,
/// and for the same reason: "off" and "not decided here" are different answers.
model GuardrailOrgOverride {
  id             Int              @id @default(autoincrement())
  guardrailId    Int              @map("guardrail_id")
  organizationId String           @map("organization_id")
  enabled        Boolean?
  action         GuardrailAction?
  threshold      Float?
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  guardrail    Guardrail    @relation(fields: [guardrailId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([guardrailId, organizationId])
  @@index([organizationId])
  @@map("guardrail_org_overrides")
}

enum GuardrailKind   { BUILT_IN PATTERN LLM_POLICY }
enum GuardrailStage  { INPUT OUTPUT BOTH }
enum GuardrailAction { BLOCK MASK LOG }
```

Plus, in existing enums: `SecurityEventType` gains `GUARDRAIL_BLOCKED` and
`GUARDRAIL_FLAGGED`; `AiUsageStep` gains `GUARDRAIL`, so a judge model's cost
appears on the AI-usage page under its own name rather than inside
`MODERATION`.

### Migration and backfill

There are no guardrail rows today, so the only data question is what the
existing behaviour becomes. The migration seeds **two platform rules**:

| Rule | `enabled` seeded from | `action` |
|---|---|---|
| `content-moderation` | `MODERATION_ENABLED === '1'` at migration time | `BLOCK` |
| `jailbreak-detection` | `JAILBREAK_DETECTION_ENABLED` truthy | `LOG` |

and, for every organization whose `OrganizationSettings.contentModerationEnabled`
is non-null, one `GuardrailOrgOverride` carrying that value. That preserves
today's on-premise semantics exactly, including the case an operator would
otherwise lose: an organization that had explicitly turned moderation off.

`OrganizationSettings.contentModerationEnabled` is **not dropped** in this
work. It keeps being written by `/rag-settings` and read by nothing, until a
follow-up removes both — a column dropped in the same release as its
replacement lands is a column with no rollback.

`MODERATION_ENABLED` stops being read at the end of Phase B. It is not replaced
by `GUARDRAILS_ENABLED`: an empty rule set is the off switch. One new optional
variable exists, `GUARDRAILS_DISABLED=1`, as break-glass for the case where a
judge model is failing and an operator needs chat back before they can reach
the panel.

## Failure modes

| Situation | Behaviour |
|---|---|
| Postgres unreachable when loading rules, cache cold | **Fail open**, and write a `critical` security event. Rejected the alternative (fail closed) because a database blip would take chat down for every tenant, and the state it falls back to is the one every installation is in today. The mitigation is the cache, not the failure path: rules are cached for 60 s per organization, so a blip does not reach the loop. |
| Judge model times out or returns malformed output | Treated as pass, `GUARDRAIL_FLAGGED` event with `metadata.error`. Same choice the jailbreak classifier already makes, and the same reason: a classifier that can take the product down is a bigger risk than the one it catches. Timeout 3 s, matching the classifier's `DEFAULT_TIMEOUT_MS` — a constant today, a per-rule field here. |
| An operator saves a catastrophically backtracking regex | Rejected at save time: the pattern is compiled and run against a 10 KB adversarial fixture with a 50 ms budget, and a pattern that exceeds it is refused with the fixture shown. At runtime there is a second guard — a total per-turn budget across all pattern rules; exceeding it skips the remainder and writes an event. Input length is already capped by `MAX_USER_INPUT_LENGTH`. |
| A rule matches every message | Nothing technical fails; this is why `LOG` is the creation default and why the page shows each rule's hit count for the last 7 days. |
| Two administrators edit the same rule | Last write wins, both recorded in the audit log with before/after. No locking — the audit trail answers "who changed it", which is the question that actually gets asked. |
| An output `BLOCK` fires after text has already streamed | The client receives `guardrail-violation` and discards the partial text it rendered. This is visible: the user sees an answer begin and then be replaced. Stated here because it is the honest consequence of streaming, and it is why an operator who wants no leakage at all must use an `LLM_POLICY` output rule, which buffers. |
| Organization deleted | `onDelete: Cascade` on both tables. Platform rules are untouched. |
| Rule deleted while a turn is mid-evaluation | The turn uses the snapshot it loaded. No coordination needed. |
| `apps/api` and `apps/web` running different builds | The rule rows are shared, the evaluators are not — a rule kind added in one release evaluates as "no verdict" on an older reader rather than throwing. The package's resolver drops unknown `kind` values, the way `sanitizeFeatureOverrides` drops unknown keys. |

## Phases

Each phase leaves the application working.

### Phase A — the package, the schema, and the authoring surface

Ends with rules an operator can create, and nothing reading them. Deliberate:
the enum members must be deployed to every reader before a writer exists.

- [ ] **A1.** `packages/guardrails` — contracts (`GuardrailKind`, `…Stage`,
      `…Action`, the built-in catalogue with labels), the pure resolver
      (platform ∪ org, overrides applied, source reported, unknown kinds
      dropped), and its unit tests. No Prisma, no Next, no provider SDK.
- [ ] **A2.** The pattern evaluator, with the save-time ReDoS validator and the
      per-turn budget. Unit tests including the adversarial fixture.
- [ ] **A3.** Prisma models, the two new `SecurityEventType` members and
      `AiUsageStep.GUARDRAIL`, migration, and the seed described above.
      `TENANT_SCOPED_MODELS` gains both models.
- [ ] **A4.** `apps/admin` → `/guardrails`: platform rules list, create, edit,
      delete, each through `requireAdmin()` and `recordAdminAction` with four
      new `ADMIN_ACTIONS` names. Sidebar entry. The page carries a banner
      saying rules are not enforced yet; B removes it.
- [ ] **A5.** Per-organization view on the same page — the organization picker
      that `/rag-settings` already uses, the effective rule set with its source
      per rule, and override controls.

### Phase B — input guardrails, every surface

- [ ] **B1.** `apps/web` binding: rule loader with the 60 s per-org cache, the
      `recordSecurityEvent` adapter, and the moderation adapter wrapping the
      existing `ModerationInstance`.
- [ ] **B2.** Replace `moderateContent()` in `basic-rag/chain.ts` and
      `conversation-chain/chain.ts` with the guardrail loop. `GuardrailError`,
      and `guardrail-blocked` in all 15 locale files.
- [ ] **B3.** Same in `apps/api/src/chains/basic-rag/chain.ts`, with the
      NestJS-side loader and `SecurityEventService` adapter. This is what makes
      the public API and the chatbot widget covered rather than assumed to be.
- [ ] **B4.** Retire the `MODERATION_ENABLED` read at all three sites; add
      `GUARDRAILS_DISABLED` to `packages/env` and to `create-ragen-app`. Remove
      A4's banner.
- [ ] **B5.** `tests/architecture/guardrails-are-not-recopied.test.ts`.

### Phase C — policies judged by a model

- [ ] **C1.** The `LLM_POLICY` evaluator: judge prompt, `generateObject` with a
      0–1 score, threshold, 3 s timeout, pass-on-error.
- [ ] **C2.** `AiUsageStep.GUARDRAIL` tracking per evaluation, so the cost is
      visible per organization before anyone leaves a policy on.
- [ ] **C3.** Absorb the jailbreak classifier: the built-in becomes a rule with
      a threshold, and `assistant-stream.ts` and the chatbot route call it
      through the loop instead of directly. `JAILBREAK_DETECTION_*` retired.
- [ ] **C4.** The rule form's policy editor, with a "test this policy" box that
      runs the judge against text the operator pastes.

### Phase D — output guardrails

- [ ] **D1.** The sliding-window transform for `PATTERN` output rules, wrapping
      `mapFullStream` in `apps/web`; unwrapped when an organization has none.
- [ ] **D2.** The same in `apps/api`'s funnel.
- [ ] **D3.** Buffered evaluation for `LLM_POLICY` output rules, and the
      warning on the rule form.
- [ ] **D4.** Persistence on an output block — the refusal written through the
      existing thread-encryption function (ADR-42), never a second branch.

### Phase E — seeing what it did

- [ ] **E1.** Hit counts per rule (last 7 days) on the guardrails page, read
      from `security_events`.
- [ ] **E2.** The incidents view filters on the two new event types.
- [ ] **E3.** `docs/guardrails.md`, a Task Router row, and the
      `docs/security-monitoring.md` table extended.

### Later, deliberately not now

Tool-call arguments through the same engine; retrieved chunks; per-project
rules; importing a rule set between installations.

## Testing

**Unit** (`packages/guardrails`, run by the root `App / Test` job):
resolution across all four layers including unknown-kind rows; every
kind × stage × action combination; the ReDoS fixture; the sliding window with a
match split across three deltas; masking with overlapping spans.

**Unit** (apps): the loader's cache behaviour including the cold-cache failure
path; the `recordSecurityEvent` and `SecurityEventService` adapters — thin
bindings, and per `AGENTS.md` the place where wiring fails silently.

**Integration**: each chain call site with a seeded blocking rule, asserting no
model call is made; the stream funnel end to end.

**Architecture**: `guardrails-are-not-recopied.test.ts`; the existing
`server-actions-are-guarded` test covers the admin actions once they are
`requireAdmin()`-wrapped; `role-checks-are-not-inlined` applies to the new page.

**E2E**, in the tier that actually gates a merge: a new `p0-` spec —
a blocking input rule produces the localized refusal and persists no assistant
message; a `LOG` rule leaves the answer untouched. Anything left at `p1`–`p3`
will not block the PR that breaks it.

**Not automated, and said out loud**: false-positive rate. That is what `LOG`
mode and E1's hit counts are for.

## Rollout and rollback

Migration first, and **every reader deployed before any writer** — the enum
hazard above is the one ordering constraint in this spec. Phase A adds the
members and no code writes them; Phase B is the first writer.

Each phase is independently revertible:

- A — revert the code; the tables stay, empty and unread. A down migration
  dropping them is written but not needed for a revert.
- B — revert restores the `MODERATION_ENABLED` reads. The seeded rules keep the
  same values, so behaviour is unchanged either way. This is the phase worth
  rehearsing on demo first.
- C, D — revert the code; rules of that kind become inert rows.

Break-glass at any point: `GUARDRAILS_DISABLED=1` on the affected service, or
disabling the offending rule in the panel, which takes effect within the 60 s
cache window.

`packages/create-ragen-app` is updated in Phase B, in the same PR, per the
post-task workflow: a fresh install gets the two seeded rules and no new
required environment variable.
