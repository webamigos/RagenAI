# Guardrails

Rules a chat turn has to pass, authored in `apps/admin` and applied by every
chat surface. A platform administrator writes them, adjusts them per
organization, and reads what they did — without a deploy, which is the thing
that was not possible before.

The design, the rejected alternatives and the phase plan are in
[the spec](specs/2026-09-18-guardrails-managed-from-the-admin-panel.md). This
page is what an operator and a maintainer need to know about what is running.

## What a rule is

| Field      | Values                              | Notes                         |
| ---------- | ----------------------------------- | ----------------------------- |
| `kind`     | `BUILT_IN`, `PATTERN`, `LLM_POLICY` | what does the detecting       |
| `stage`    | `INPUT`, `OUTPUT`, `BOTH`           | which side of the turn        |
| `action`   | `BLOCK`, `MASK`, `LOG`              | what a hit does               |
| `severity` | `info`, `warn`, `critical`          | the security event's severity |
| `enabled`  | boolean                             | **false on creation, always** |

A new rule starts switched off because a rule that begins by blocking is a rule
whose false-positive rate nobody has measured. `LOG` is the creation default
for the same reason: it records a hit and lets the turn through, which is what
makes the hit counts on the page worth reading.

Not every combination exists. `MASK` needs a span to replace, and a built-in
detector or a judge model returns a verdict over the whole text — so masking is
a `PATTERN` action only. `ACTIONS_BY_KIND` in
[`packages/guardrails`](../packages/guardrails/src/contracts/guardrail.ts) is
the authority, and the admin form offers only what it allows.

### What this build actually evaluates

Two lists, and they are deliberately different questions:

- **`SUPPORTED_COMBINATIONS`** — what the package can evaluate:
  `PATTERN`/`INPUT` and `BUILT_IN`/`INPUT`. The resolver drops anything else,
  so an older service meeting a row from a newer one treats it as no verdict
  rather than throwing.
- **`AUTHORABLE_COMBINATIONS`** — what an operator may create:
  `PATTERN`/`INPUT` alone. A built-in is _seeded_, identified by a `key` the
  code knows; one somebody typed would have no detector behind it.

Support for a built-in is **per key, not per kind**. `content-moderation` is
evaluated; `jailbreak-detection` is seeded and is not (`EVALUABLE_BUILT_IN_KEYS`),
and it gains its evaluator and that entry in the same change — never before, or
it reads as enabled and does nothing.

`LLM_POLICY` and the `OUTPUT` stage are not shipped. Both are in the schema and
in the vocabulary so that every reader had them before a writer appeared.

## How a rule reaches an organization

```
effective set = (platform rules, overrides applied)  ∪  that organization's own rules
```

- `Guardrail` with `organizationId = null` — a platform rule, for everyone.
- `Guardrail` with an `organizationId` — that organization's own.
- `GuardrailOrgOverride` — adjusts a platform rule for one organization. Every
  field nullable; **null means inherit**, and inherit is the absence of a row,
  not a row full of nulls.

Resolution is a pure function
([`resolver/resolve.ts`](../packages/guardrails/src/resolver/resolve.ts)) and
reports, per value, which layer decided it — the admin page shows that, because
an operator who cannot see _why_ a rule is on is not in control of it.

An override whose target is not a platform rule is incoherent. It is refused
twice: the admin action will not write one, and the resolver drops it.

**One override origin is special.** Rows marked `legacy_on_premise` were seeded
by the migration from `OrganizationSettings.contentModerationEnabled`, and are
honoured only when the installation is on-premise — because that column was
only ever read there, and honouring it in SaaS would switch moderation _off_
for tenants that have it on. An administrator editing such a row clears the
marking: their decision applies everywhere, like any other override.

## Where it runs

Three call sites, all inside the chain:

- `apps/web/src/libs/chains/basic-rag/chain.ts`
- `apps/web/src/libs/chains/conversation-chain/chain.ts`
- `apps/api/src/chains/basic-rag/chain.ts`

That is the complete set. `/api/threads`, `/api/guest-threads/…` and
`/api/chatbot/[token]/chat` all build a web chain; `apps/api`'s `/chat` and
`/chat-completions` build the API one — so the public API and the embedded
widget are covered rather than assumed to be.

What differs per runtime — reaching a database, recording an event, which error
class is thrown — is injected. What a rule _means_ is
`evaluateInputStage()`, once, for both. A masking rule that covered chat
history in one runtime and not the other would be two products, and the public
API is the one nobody would notice was wrong;
`tests/architecture/guardrails-are-not-recopied.test.ts` is the tripwire.

### Guardrails run downstream of PII masking

By the time a rule sees a turn, Presidio has already replaced personal data
with placeholders. A pattern like `\d{11}` will **not** match a national ID —
it sees `<PESEL_1>`. On output, rules read the model's text before
`StreamUnmasker` puts the personal data back.

This is a division of labour, not an oversight: PII is the
[PII policy's](document-processing.md) job, on a path that also covers ingest.
An operator who wants to match on the placeholders can; the rule form says so.

### The budget, and rules that did not run

Pattern evaluation has a per-turn time budget. A rule skipped because the
budget was exhausted is **reported, not swallowed** — an organization whose
guardrails quietly stop applying as it adds more of them is the failure the
budget itself would otherwise cause.

A pattern is validated when it is saved, in a worker killed on a deadline: a
catastrophically backtracking regex cannot be interrupted once a request has
entered it, so save time is the only place it can be stopped.

## What a hit does

| Action  | Effect                                                                                                                                     | Event               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `LOG`   | nothing; the turn proceeds                                                                                                                 | `GUARDRAIL_FLAGGED` |
| `MASK`  | the matched span is replaced before the text moves on                                                                                      | `GUARDRAIL_FLAGGED` |
| `BLOCK` | the turn is refused — `GuardrailError`, code `guardrail-blocked`, localized in `apps/web`; the OpenAI-compatible error shape in `apps/api` | `GUARDRAIL_BLOCKED` |

`MASK` changes what the model is given, never what the thread records — and it
is applied to the assembled chat history every turn, not only to the current
message. Otherwise a mask applied at turn one is undone at turn two, when the
original comes back through history.

The event carries the rule's `publicId`, its key or name, kind, stage, action
and a **match count**. It never carries the matched text: that is the
customer's message, which this product encrypts per organization (ADR-06) and
scrubs before it reaches a log. The rule and the count are enough to tell a
false positive from a real one.

Severity is the rule's own, not a constant — an operator who set a rule to
`info` said it was noise, and overriding that here would make the alerting
threshold unreachable.

## Reading what they did

- **`/guardrails` in `apps/admin`** — each rule's hits over the last 7 days,
  split into blocked and flagged, across every organization and both runtimes.
  A rule that is on and has matched nothing shows `0`; a rule that is off
  everywhere shows `—`, because a rule nothing evaluated has not been measured
  and `0` would read as "measured, no false positives".

  "Off everywhere" is the platform default **plus** no override rows: an
  override can switch a platform-disabled rule on for one organization
  (`resolve.ts` takes `enabled` from the override whenever it is set), and its
  hits carry the same rule id. So a rule that is off by default but overridden
  somewhere shows `0` rather than `—`, and its hits are never described as
  historical.

- **`/incidents`** — filter by `Any guardrail hit`, or by blocked and flagged
  separately. "What did we stop" and "what did we merely notice" are the two
  questions worth asking of a rule set, which is why they are two event types.

Neither escalates on burst: see [security-monitoring](security-monitoring.md).

## Switching it off

**In the panel**, which is the normal path: disable the rule. It stops applying
within the 60 s cache.

**With the environment**, for the case the panel cannot reach in time — a
pattern matching every message, faster than an operator can sign in:

```bash
GUARDRAILS_DISABLED=1
```

Restart, and the service behaves as every installation did before guardrails
existed. It is parsed through the same truthy set as `IS_ON_PREMISE`, because
somebody reaching for it is reaching for it during an incident and
`GUARDRAILS_DISABLED=true` must not quietly mean "no". There is no
`GUARDRAILS_ENABLED`: an installation that has written no rules is already in
the state such a variable would give it.

A **failed** rule load fails open, and the failure is cached for 5 s so an
outage costs one query per organization per interval rather than one per turn.
That interval is the one in which guardrails are not enforced, which is why it
is measured in seconds while the success window is measured in a minute.

## Before a deploy that changes enforcement

```bash
npm run guardrails:preflight
```

Run it against the environment each service will actually get. It reads the
database and exits non-zero while the panel and the environment disagree about
what is enforced — the case it exists for is an installation running with
moderation on via an environment variable whose `content-moderation` rule is
still disabled in the panel, where deploying loses protection and _nothing
errors_: the chat keeps answering and the only evidence is an absence.

## Testing

Unit tests live beside the source in `packages/guardrails` and run in the root
`App / Test` job. Two guards in `tests/architecture/` hold the rules this page
describes — no app re-implements an evaluation decision, and the documented
cache window matches the constant. The end-to-end proof that a rule reaches a
turn at all is `apps/web/e2e/p0-29-guardrail-refusal.spec.ts`: it asserts the
loader is _reached_, not only that a blocked turn is refused, because a rule
that does nothing is indistinguishable from every screen a person can see.
