---
title: Guardrails, authored and applied from the admin panel
status: draft
areas: [admin, chat, api, security]
adrs: [33, 35, 39, 42]
---

# Guardrails, authored and applied from the admin panel

## TLDR

A platform administrator gets one page in `apps/admin` where they author the
rules a chat turn has to pass — built-in ones (content moderation, jailbreak
detection) and ones they write themselves (a pattern, or a policy in plain
language judged by a model) — set per rule whether a hit blocks, masks or is
only logged, and override any of it for a single organization. The rules run on
both sides of the turn, on every chat surface, from one call site per side per
app. The two things that are not obvious: guardrails sit **downstream of PII
masking**, so they never see a phone number and must not pretend to; and a
model-judged *output* rule cannot stream, so the kind of rule an operator picks
decides whether that organization's answers still appear word by word.

## What already exists

This is not a green field. Four checks run on a chat turn today, and each was
wired separately:

| Check | Where | Controlled by | Blocks? |
|---|---|---|---|
| OpenAI content moderation | `basic-rag/chain.ts`, `conversation-chain/chain.ts` (web) and `apps/api/src/chains/basic-rag/chain.ts` | `MODERATION_ENABLED=1` env, **and** `OrganizationSettings.contentModerationEnabled` when `IS_ON_PREMISE` | yes — throws `ModerationError` |
| Jailbreak classifier | `src/libs/security/jailbreak-classifier.ts`, called from `assistant-stream.ts:811` and `chatbot/[token]/chat/route.ts` — **never from `apps/api`** | `JAILBREAK_DETECTION_ENABLED` + `…_THRESHOLD` env | no — telemetry only |
| Tool-call gating / arg inspection | `src/libs/security/tool-gating-context.ts`, `tool-arg-inspector.ts`, duplicated in `apps/api/src/security/` | code constants | yes, by pausing for approval |
| PII policy | `src/libs/pii/`, `UserFile.piiPolicy`, `DocumentFolder.piiPolicy`, `OrganizationSettings.piiIngestionMode` | per file / folder / org | masks |

Four facts about that table shape this spec.

**An operator has four places to look and two of them are environment
variables.** `MODERATION_ENABLED` is a process-level kill switch; the per-org
toggle beneath it is consulted only on-premise. A platform administrator can
already set that toggle for one organization from `apps/admin`'s
`/rag-settings` — and it still does nothing unless an environment variable was
set at deploy time. (The same slug exists in `apps/web` under
`organization/rag-settings`; that one renders every `Switch` `disabled` and is
the customer's read-only view. Where this spec says `/rag-settings` unqualified
it means the admin one.)

**The chains are duplicated, not shared.** `apps/web/src/libs/chains/` and
`apps/api/src/chains/` hold two copies of the same pipeline, and the security
helpers are duplicated across `apps/web/src/features/security/utils/`
(`pii-scrubber.ts`, `escalation-rules.ts`, `severity-threshold.ts`),
`apps/web/src/libs/security/` (`tool-arg-inspector.ts`,
`tool-gating-context.ts`) and `apps/api/src/security/`, which holds copies of
all five. Anything added at the call-site level has to be added twice or it
silently protects one surface and not the other. `packages/rag-core` exists but
holds the vector, embedding and document-access contracts plus the BM25
encoder — not chain behaviour.

**Everything the chain sees is already masked.** `assistant-stream.ts:798`
runs `anonymizeWithSecurityEvents()` and passes `piiResult.maskedText` into the
chain at line 852; `StreamUnmasker` is constructed at line 876, *downstream* of
the chain's own stream. So a guardrail placed in the chain — on either side —
reads Presidio placeholders where the personal data used to be. That is a
constraint, not a bug, and the design below states what it costs.

**Severity and escalation are already solved.** `recordSecurityEvent` scrubs
PII, applies burst escalation, writes `security_events` and emails on
`critical`. Guardrails produce events through it rather than inventing a second
audit path.

## Problem

An operator running one Ragen installation for several client organizations
cannot answer "what is this assistant not allowed to say, and to whom", and
cannot change the answer without a deploy.

None of these is possible today:

- Turn content moderation on for one client and off for another without setting
  a process-wide environment variable.
- Add a rule of their own — "never discuss a competitor's pricing", "this
  tenant's assistant answers only about their product catalogue" — in any form.
- Run a new rule in observation mode to see how often it would have fired,
  before letting it block a customer's message.
- See, in one place, how often anything was blocked.

The evidence that this is a gap and not a preference: the jailbreak
classifier's own file says it is "telemetry, not defense" and that shipping it
off by default was to validate cost and latency "against real traffic" — the
observation-mode need, solved once, in code, for one detector, and unavailable
to anything else. And `docs/security-monitoring.md` documents tuning thresholds
by editing `src/libs/security/tool-arg-inspector.ts`, which is a deploy.

## Out of scope

- **PII masking stays where it is**, and guardrails do not attempt to replace
  it. They cannot: they run behind it. `PiiPolicy` is per file and per folder
  and is also applied at ingest by the worker. The guardrails page links to the
  PII pages; it does not own them.
- **Tool-call gating and tool-arg inspection stay where they are.** They act on
  a tool call's arguments mid-stream, not on the turn's text, and already have
  a working approval UI.
- **Retrieved chunks are not inspected.** That touches retrieval, which under
  ADR-20 means a measurement round; its own spec.
- **No rules on raw, pre-masking text.** See "Later, deliberately not now".
- **No per-user or per-project scoping.** Platform-wide or per-organization.
- **Org admins do not author rules** (ADR-35). `apps/web` shows an organization
  which guardrails apply to it, read-only, as `organization/rag-settings`
  already shows the pipeline toggles.
- **No versioning or scheduled activation.** A rule is edited in place; the
  audit log records who changed what.

## Proposed solution

### One package, two call sites per app

A new workspace package, **`packages/guardrails`**, owns the vocabulary, the
resolution rules and the evaluators. It has no Prisma, Next, provider-SDK or
`server-only` import: rows arrive as plain objects, model calls arrive as
injected functions, events leave through an injected recorder. That is the
shape `tenant-scope` already uses in `packages/platform-contracts` — the
package holds the part with no Prisma dependency and each app keeps a thin
binding.

It is a new package rather than a folder in `platform-contracts` because it
carries runtime evaluators (regex execution, a judge prompt, a stream
transform) and `platform-contracts` is deliberately a contracts package. It is
not `rag-core` because guardrails apply to the conversation chain too, which
does no retrieval.

Rejected alternatives:

- **Put the logic in `apps/web` and have `apps/api` call it over the internal
  API.** `apps/api` already calls `/api/v1/*` behind `INTERNAL_API_SECRET`, so
  it is not unprecedented. Rejected: it puts a network hop in the hot path of
  every turn on the public API, and a guardrail that fails while the web app
  redeploys is worse than one that does not exist.
- **Duplicate it, like the security helpers already are.** Rejected on the
  evidence above — five helpers, three directories, two apps — and on ADR-33.
  An architecture test (`guardrails-are-not-recopied.test.ts`) locks it.

### What a rule is

Three kinds, one table, one evaluation loop:

| Kind | What it matches | Cost | Valid actions |
|---|---|---|---|
| `BUILT_IN` | a named detector in code (`content-moderation`, `jailbreak-detection`) | one provider call | `BLOCK`, `LOG` |
| `PATTERN` | a literal or regex over the text | microseconds, no I/O | `BLOCK`, `MASK`, `LOG` |
| `LLM_POLICY` | a policy written in prose, scored 0–1 by a judge model | one model call per turn per rule | `BLOCK`, `LOG` |

`MASK` is rejected at save time for `BUILT_IN` and `LLM_POLICY`: neither
returns a span, so there is nothing to replace, and an action that silently
degrades to "block" is the kind of thing discovered in production.

Each rule also carries a `stage` (`INPUT`, `OUTPUT`, `BOTH`), `enabled`, a
`severity` for the event it writes and — for `LLM_POLICY` and scored built-ins
— a `threshold`.

The catalogue of built-ins lives in the package as a frozen array with labels,
exactly as `FEATURE_KEYS` / `FEATURE_LABELS` do, so the admin panel and the
runtime cannot disagree about what `jailbreak-detection` is called.

**The package also exports which kind × stage combinations the running build
can actually evaluate** (`SUPPORTED_COMBINATIONS`). The admin form reads it and
refuses the rest. That is what keeps the panel honest while phases C and D are
still unshipped — a single "not enforced yet" banner would go on lying the
moment the first kind works.

### What a guardrail can and cannot see

Every call site below sits inside the chain, so:

- On input it reads `piiResult.maskedText` — the user's message with Presidio
  placeholders where personal data was.
- On output it reads the model's text *before* `StreamUnmasker` puts the
  personal data back.

So a pattern like `\d{11}` will not match a national ID: by the time a
guardrail sees the turn, the number is `<PESEL_1>`. This is the right division
of labour — PII is the PII policy's job, on a path that also covers ingest —
but it must be said in the product, not discovered. The rule form states it,
and the `PATTERN` help text says what the placeholders look like so an operator
can match *on* them if that is what they want.

The alternative — evaluating raw text at the route level, before masking —
would mean five web call sites instead of two and a rule engine that reads
unmasked personal data on every turn. Rejected for both reasons. If it is ever
needed it is a fourth stage (`RAW_INPUT`) with its own spec, not a change to
these.

### How a rule reaches an organization

Two tables, mirroring the tri-state inheritance feature flags already use:

- **`Guardrail`** with `organizationId = null` — a platform rule, applying to
  every organization.
- **`Guardrail`** with an `organizationId` — that organization's own rule.
- **`GuardrailOrgOverride`** — adjusts a platform rule for one organization.
  Every field nullable; null means inherit.

Effective set = (platform rules, overrides applied) ∪ (that organization's own
rules). Resolution is a pure function in the package and returns, per rule, the
layer that decided each value — the same `FeatureSource` idea, for the same
reason: an operator who cannot see *why* a rule is on is not in control of it.

An override whose `Guardrail` is not a platform rule is incoherent (it would
splice one organization's private rule into another's set). Nothing in the
schema can express that constraint across two tables, so it is enforced twice:
the admin action refuses to create one, and the resolver drops it — the same
belt-and-braces `sanitizeFeatureOverrides` applies to untyped JSON.

Rejected alternative: a JSON blob on `OrganizationSettings`, like
`featureOverrides`. Fine for ten booleans; useless for rules an operator
creates and deletes, because there is no row to audit, no id for a security
event's metadata, and no way to ask which organizations a rule applies to.

### Where it runs

**Input** — replacing the current `moderateContent()` call, at exactly three
sites:

- `apps/web/src/libs/chains/basic-rag/chain.ts`
- `apps/web/src/libs/chains/conversation-chain/chain.ts`
- `apps/api/src/chains/basic-rag/chain.ts`

That is the complete set: `/api/threads`, `/api/guest-threads/…` and
`/api/chatbot/[token]/chat` all build a web chain; `apps/api`'s `/chat` and
`/chat-completions` build the API one. Evaluation runs concurrently with
`rephraseAndExpand`, as moderation does today.

**Output** — in the stream funnel: `mapFullStream` in
`apps/web/src/libs/chains/utils/stream-mapper.ts` and its counterpart at
`apps/api/src/chains/utils/stream-mapper.ts`.

- A `PATTERN` output rule runs on a **sliding window**: deltas are emitted as
  they arrive except the last 256 characters, held back so a match spanning a
  chunk boundary is still caught. In `apps/web` this transform is placed
  **inside** `mapFullStream`, upstream of `StreamUnmasker`, so there is one
  buffering layer inside the chain and one outside it and the order is fixed
  rather than emergent.
- An `LLM_POLICY` output rule **cannot stream**: the judge needs the finished
  answer, so the stream is buffered and released after the verdict. The rule
  form says so next to the toggle, in words: *"Output policies judged by a
  model delay the whole answer — it appears at once instead of word by word."*

An organization with no output rules pays nothing: the funnel returns the
original iterator unwrapped.

### What a hit does

- `LOG` — a security event; the turn proceeds. This is observation mode and the
  default for every rule on creation. A rule that starts by blocking is a rule
  whose false-positive rate nobody measured.
- `MASK` — the matched span is replaced before the text moves on, plus the
  event. The placeholder vocabulary is deliberately distinct from Presidio's
  (`[[redacted:<rule>]]`, not `<TYPE_n>`) so `StreamUnmasker`, which walks the
  same buffer for alias tokens, cannot mistake one for the other. On input, the
  **stored** user message is the original: masking changes what the model is
  given, not what the thread records.
- `BLOCK` on input — a `GuardrailError` (`ChainError`, code
  `guardrail-blocked`) through the existing chain-error path, localized in
  `apps/web`. `apps/api` has no locale layer, so it returns the code in the
  OpenAI-compatible error shape and the caller renders it.
- `BLOCK` on output — the stream stops, a `guardrail-violation` part is
  emitted, and what is persisted as the assistant message is the refusal, never
  the withheld text, written through the same encryption function as every
  other thread-derived write (ADR-42). Emitting the stop and writing the
  refusal are one change, not two: shipping the first alone stores the text the
  rule exists to suppress.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | two models, three enums, two `SecurityEventType` members, one `AiUsageStep` member | migration + `npm run verify`; the rolling-deploy hazard below |
| `packages/guardrails` (new) | the whole capability | own unit tests; consumers web / api / admin build |
| `apps/web/src/libs/chains/**` | two input sites, one stream funnel | chain unit tests + `p0` e2e |
| `apps/api/src/chains/**` | one input site, one stream funnel | api spec suite |
| `apps/admin` server actions | `/guardrails` page and its actions | `server-actions-are-guarded`, `role-checks-are-not-inlined` |
| `apps/web/src/app/messages/*.json` | one key in 15 locale files | `npm run web:build`; note below |
| `packages/env` | one optional boolean | package tests + each app's env schema test |
| `packages/create-ragen-app` | `GUARDRAILS_DISABLED` documented; no new required variable | `create-ragen-app-manifest-is-current.test.ts` |
| tenant scoping | **no** entry in `TENANT_SCOPED_MODELS` — see below | a dedicated query test instead |

Three of those rows carry a known trap.

**Locale JSON is the conflict point.** Fifteen files gain `guardrail-blocked`
beside `moderation-error`. If this work is split across branches, regenerate
the files from `main` plus a key list rather than resolving by hand.

**New enum members break older readers.** Three separately generated Prisma
clients read `security_events` and `ai_usage`, and the services deploy
independently — see
[`docs/lessons/adding-an-enum-value-breaks-older-readers.md`](../lessons/adding-an-enum-value-breaks-older-readers.md).
This applies to `GUARDRAIL_BLOCKED` / `GUARDRAIL_FLAGGED` **and** to
`AiUsageStep.GUARDRAIL`. All four land in Phase A, with no writer, so every
reader is deployed before the first row exists.

**`Guardrail` is deliberately absent from `TENANT_SCOPED_MODELS`.** Loading the
effective set needs `where: { OR: [{ organizationId: orgId }, { organizationId:
null }] }`, and `hasDefinedField(args.where, 'organizationId')` is false for
that shape while `findMany` is in `WHERE_OPERATIONS` — so adding it would make
the guard warn on the hottest path in the product, every turn. A guard that
cries wolf on its busiest query is worse than one that stays quiet, and the
model is not user-reachable: only platform admins write it. A unit test asserts
the loader's `where` instead.

## Data model

```prisma
model Guardrail {
  id             Int             @id @default(autoincrement())
  publicId       String          @unique @default(uuid()) @map("public_id")
  /// null = a platform rule, applying to every organization.
  organizationId String?         @map("organization_id")
  /// Set for BUILT_IN rules, null for operator-authored ones.
  key            String?
  name           String
  description    String?
  kind           GuardrailKind
  stage          GuardrailStage
  action         GuardrailAction @default(LOG)
  enabled        Boolean         @default(true)
  severity       SecurityEventSeverity @default(warn)
  pattern        String?          // PATTERN only
  patternIsRegex Boolean         @default(false) @map("pattern_is_regex")
  policy         String?          // LLM_POLICY only — the prose the judge gets
  threshold      Float?           // LLM_POLICY and scored built-ins, 0–1
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
/// for the same reason: "off" and "not decided here" are different answers.
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

`@@unique([organizationId, key])` does **not** stop two platform rules claiming
the same built-in, because Postgres treats NULLs as distinct. The migration
therefore adds, by hand, a partial index the Prisma schema cannot express:

```sql
CREATE UNIQUE INDEX guardrails_platform_key_unique
  ON guardrails (key) WHERE organization_id IS NULL AND key IS NOT NULL;
```

Without it the resolver can be handed two verdicts for one detector and has no
defined answer.

Plus, in existing enums: `SecurityEventType` gains `GUARDRAIL_BLOCKED` and
`GUARDRAIL_FLAGGED`; `AiUsageStep` gains `GUARDRAIL`, so a judge model's cost
shows on the AI-usage page under its own name rather than inside `MODERATION`.

### Migration, and what happens to today's behaviour

**No migration in this repository contains an `INSERT`, and none can read
`process.env`.** So the seed splits in two along exactly that line:

*What SQL can do, and the migration does:* insert the two built-in platform
rules — `content-moderation` (`BLOCK`) and `jailbreak-detection` (`LOG`), both
`enabled = false` — and insert a `GuardrailOrgOverride` for every organization
whose `OrganizationSettings.content_moderation_enabled` is non-null, carrying
that value. The per-org half of today's semantics is in the database, so it
survives exactly, including the organization that had explicitly turned
moderation off.

*What SQL cannot do:* know whether `MODERATION_ENABLED=1` was set on this
installation. Seeding `enabled = false` is the safe half of that choice — no
installation starts blocking something it was not blocking — but an
installation that *was* moderating would silently stop at the B cutover. So
the cutover is gated on an explicit step, not a guess:
`npm run guardrails:preflight` prints each service's `MODERATION_ENABLED` and
`JAILBREAK_DETECTION_ENABLED` beside the corresponding rule's `enabled`, and
exits non-zero while they disagree. The rollout section below puts it before
the B deploy.

`OrganizationSettings.contentModerationEnabled` is **not dropped** here. It
keeps being written by `/rag-settings` and read by nothing, until a follow-up
removes both: a column dropped in the release that replaces it is a column with
no rollback.

`MODERATION_ENABLED` and `JAILBREAK_DETECTION_*` stop being read in Phases B
and C. They are not replaced by a `GUARDRAILS_ENABLED` — an empty rule set is
the off switch. One new optional variable exists, `GUARDRAILS_DISABLED=1`, as
break-glass for a judge model failing faster than an operator can reach the
panel.

## Failure modes

| Situation | Behaviour |
|---|---|
| Postgres unreachable when loading rules, cache cold | **Fail open.** The alarm is a `logger.error` with `audit: true`, *not* a security event — `recordSecurityEvent` writes to the database that is down, so an event is the one alarm this failure would swallow. Rejected fail-closed: a blip would take chat down for every tenant, and the state it falls back to is the one every installation is in today. The real mitigation is the 60 s per-org cache, so a blip does not reach the loop at all. |
| Judge model times out or returns malformed output | Treated as pass, `GUARDRAIL_FLAGGED` with `metadata.error`. Same choice the jailbreak classifier already makes: a classifier that can take the product down is a bigger risk than the one it catches. Timeout 3 s, the classifier's current `DEFAULT_TIMEOUT_MS`, as a per-rule field. |
| An operator saves a catastrophically backtracking regex | Refused at save time: compiled and run against a 10 KB adversarial fixture with a 50 ms budget, and a pattern that exceeds it is rejected with the fixture shown. At runtime a second guard — a total per-turn budget across all pattern rules; exceeding it skips the remainder and logs. Input is already capped by `MAX_USER_INPUT_LENGTH` (10 000). |
| A rule matches every message | Nothing technical fails; this is why `LOG` is the creation default and why the page shows each rule's 7-day hit count. |
| An override points at a rule that is not a platform rule | Refused by the admin action; dropped by the resolver if one exists anyway. |
| Two platform rules claim one built-in key | Prevented by the partial unique index above. |
| Two administrators edit the same rule | Last write wins; both in the audit log with before/after. No locking — the audit trail answers the question that actually gets asked. |
| An output `BLOCK` fires after text has streamed | The client receives `guardrail-violation` and discards what it rendered: the user sees an answer begin and then be replaced. This is the honest cost of streaming, and it is why an operator who wants no leakage at all must use an `LLM_POLICY` output rule, which buffers. |
| Organization deleted | `onDelete: Cascade` on both tables; platform rules untouched. |
| Rule deleted mid-turn | The turn uses the snapshot it loaded. No coordination. |
| `apps/web` and `apps/api` on different builds | Rows are shared, evaluators are not. The resolver drops rules whose `kind` or `stage` is outside `SUPPORTED_COMBINATIONS` for the running build, the way `sanitizeFeatureOverrides` drops unknown keys — an older reader evaluates them as "no verdict" instead of throwing. |

## Phases

Each phase leaves the application working.

### Phase A — the package, the schema, the authoring surface

Ends with rules an operator can create and nothing reading them. Deliberate:
the four enum members must reach every reader before a writer exists.

- [ ] **A1.** `packages/guardrails` — contracts (`GuardrailKind`, `…Stage`,
      `…Action`, the built-in catalogue with labels, `SUPPORTED_COMBINATIONS`),
      the pure resolver (platform ∪ org, overrides applied and validated,
      source reported, unsupported combinations dropped) and its unit tests. No
      Prisma, Next or provider SDK.
- [ ] **A2.** The pattern evaluator, the save-time ReDoS validator and the
      per-turn budget, with the adversarial fixture in the tests.
- [ ] **A3.** Prisma models, the partial unique index, the two
      `SecurityEventType` members and `AiUsageStep.GUARDRAIL`, the migration
      and the SQL half of the seed.
- [ ] **A4.** `apps/admin` → `/guardrails`: platform rules list, create, edit,
      delete, each behind `requireAdmin()` and `recordAdminAction` with four
      new `ADMIN_ACTIONS` names; sidebar entry. The form offers only what
      `SUPPORTED_COMBINATIONS` reports, so nothing on the page claims an effect
      it does not have.
- [ ] **A5.** Per-organization view on the same page — the organization picker
      `/rag-settings` already uses, the effective set with each value's source,
      and override controls.

### Phase B — input guardrails, every surface

- [ ] **B1.** `GUARDRAILS_DISABLED` in `packages/env` and in
      `create-ragen-app`, plus `npm run guardrails:preflight`. Both land
      **before** any rule can block: the break-glass has to exist by the time
      the first customer message can be refused.
- [ ] **B2.** `apps/web` binding — the rule loader with its 60 s per-org cache
      and cold-cache fail-open path, the `recordSecurityEvent` adapter, and the
      moderation adapter over the existing `ModerationInstance`.
- [ ] **B3.** Replace `moderateContent()` in `basic-rag/chain.ts` and
      `conversation-chain/chain.ts`, retire the `MODERATION_ENABLED` read at
      both, add `GuardrailError` and `guardrail-blocked` to 15 locale files.
      One step: while the env gate stands, a rule enabled in the panel still
      does nothing, which is the gap this spec exists to close.
- [ ] **B4.** The same in `apps/api/src/chains/basic-rag/chain.ts`, with the
      NestJS loader, the `SecurityEventService` adapter and the error shape.
      This is what makes the public API and the chatbot widget covered rather
      than assumed to be.
- [ ] **B5.** `tests/architecture/guardrails-are-not-recopied.test.ts`.

### Phase C — policies judged by a model

- [ ] **C1.** The `LLM_POLICY` evaluator *and* its `AiUsageStep.GUARDRAIL`
      tracking, in one step — a judge that runs without recording its cost is
      the thing C2 was supposed to prevent. Judge prompt, `generateObject` with
      a 0–1 score, threshold, 3 s timeout, pass-on-error.
- [ ] **C2.** Absorb the jailbreak classifier as a scored built-in evaluated
      **inside the loop**, and delete the two route-level calls in
      `assistant-stream.ts` and `chatbot/[token]/chat/route.ts`. This is not
      just tidying: `apps/api` never called the classifier at all, so until it
      runs in the chain the `jailbreak-detection` rule resolves for API traffic
      and is enforced by nothing there. `JAILBREAK_DETECTION_*` retired.
- [ ] **C3.** The policy editor, with a "test this policy" box that runs the
      judge against text the operator pastes.

### Phase D — output guardrails

Independently revertible, and the only phase that touches thread persistence.
If it slips, A–C and E still ship a complete capability.

- [ ] **D1.** The sliding-window transform for `PATTERN` output rules inside
      `mapFullStream` in `apps/web`, **including** the persistence path: a
      blocked output writes the refusal, never the withheld text, through the
      existing thread-encryption function (ADR-42). Stopping the stream and
      deciding what is stored are one change.
- [ ] **D2.** The same in `apps/api`'s funnel.
- [ ] **D3.** Buffered evaluation for `LLM_POLICY` output rules, and the
      latency warning on the rule form.
- [ ] **D4.** `SUPPORTED_COMBINATIONS` opens the `OUTPUT` stage; the admin form
      starts offering it.

### Phase E — seeing what it did

- [ ] **E1.** 7-day hit counts per rule on the guardrails page, from
      `security_events`.
- [ ] **E2.** The incidents view filters on the two new event types.
- [ ] **E3.** `docs/guardrails.md`, a Task Router row, and the
      `docs/security-monitoring.md` table extended.

### Later, deliberately not now

A `RAW_INPUT` stage that runs before PII masking; tool-call arguments through
the same engine; retrieved chunks; per-project rules; importing a rule set
between installations.

## Testing

**Unit** (`packages/guardrails`, run by the root `App / Test` job): resolution
across all four layers, including unsupported-combination and incoherent-override
rows; every kind × stage × action; the ReDoS fixture; a sliding window with a
match split across three deltas; masking with overlapping spans; the
`[[redacted:…]]` vocabulary not colliding with Presidio's `<TYPE_n>`.

**Unit** (apps): the loader's `where` shape and cache behaviour, including the
cold-cache fail-open path and that it logs rather than trying to record an
event; the `recordSecurityEvent` and `SecurityEventService` adapters — thin
bindings, and per `AGENTS.md` exactly where wiring fails silently.

**Integration**: each chain call site with a seeded blocking rule, asserting no
model call is made; the stream funnel end to end, with `StreamUnmasker`
downstream, asserting alias tokens still resolve.

**Architecture**: `guardrails-are-not-recopied.test.ts`; the existing
`server-actions-are-guarded` and `role-checks-are-not-inlined` tests cover the
new admin page.

**E2E**, in the tier that gates a merge: a new `p0-` spec — a blocking input
rule produces the localized refusal and persists no assistant message; a `LOG`
rule leaves the answer untouched. Anything left at `p1`–`p3` will not block the
PR that breaks it.

**Not automated, and said out loud**: the false-positive rate. That is what
`LOG` mode and E1's hit counts are for.

## Rollout and rollback

Migration first, and **every reader deployed before any writer** — the enum
hazard is the one hard ordering constraint here. Phase A adds all four members
and writes none.

Before the Phase B deploy, run `npm run guardrails:preflight` on each service
and reconcile: if `MODERATION_ENABLED=1` today, enable the `content-moderation`
rule in the panel first. Skipping this is the one way to lose protection
silently, which is why the script exits non-zero while the two disagree.

Each phase is independently revertible:

- **A** — revert the code; the tables stay, empty and unread. A down migration
  is written but not needed for a revert.
- **B** — revert restores the `MODERATION_ENABLED` reads. Rehearse on demo:
  this is the phase where a customer's message can first be refused.
- **C**, **D** — revert the code; rules of that kind become inert rows,
  because the resolver drops what the build cannot evaluate.

Break-glass at any point: `GUARDRAILS_DISABLED=1` on the affected service, or
disabling the rule in the panel, which takes effect within the 60 s cache
window.

`packages/create-ragen-app` is updated in B1, in the same PR, per the post-task
workflow: a fresh install gets the two built-in rules, disabled, and no new
required environment variable.
