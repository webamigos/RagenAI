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
  `PATTERN`/`INPUT`, `BUILT_IN`/`INPUT` and `LLM_POLICY`/`INPUT`. The resolver
  drops anything else, so an older service meeting a row from a newer one
  treats it as no verdict rather than throwing.
- **`AUTHORABLE_COMBINATIONS`** — what an operator may create:
  `PATTERN`/`INPUT` and `LLM_POLICY`/`INPUT`. A built-in is _seeded_,
  identified by a `key` the code knows; one somebody typed would have no
  detector behind it, so it stays off this list however many detectors exist.
  The admin action validates against this list rather than the one above,
  because a Server Action is a public endpoint.

  `LLM_POLICY` was evaluable from C1 and authorable only from C3, and the gap
  was the point. A policy rule saved before the form had a prose field would
  have been written with no `policy` — the row the resolver drops, on a page
  showing it enabled. **A kind joins this list in the same change that gives
  the form a field for everything that kind needs**, which is the same rule
  `SUPPORTED_COMBINATIONS` states for evaluators, applied to authoring.

Support for a built-in is **per key, not per kind**, and both seeded detectors
are now evaluated (`EVALUABLE_BUILT_IN_KEYS`). A key gains its evaluator and
its entry in that list in the same change — never before, or it reads as
enabled and does nothing.

They are evaluated differently, which is the point of the per-key list:
`content-moderation` asks OpenAI's moderation endpoint, which returns a flag;
`jailbreak-detection` asks a judge model, which returns a score. The second
therefore shares the policy loop below rather than the moderation branch.

The `OUTPUT` stage is not shipped. It is in the schema and in the vocabulary so
that every reader had it before a writer appeared.

### Policies judged by a model

Two kinds of rule are scored by a judge model from 0 to 1: an `LLM_POLICY`,
judged against the operator's prose, and the `jailbreak-detection` built-in,
judged against a prompt fixed in code. At or above the rule's `threshold` —
0.7 when it names none — the rule has fired.

Which prompt a rule gets is `judgeRequestFor` in the package, not a decision
either binding makes. A binding is handed a system prompt and a user prompt
and asks the model; that is all it knows. Two runtimes free to choose the
prompt would choose differently eventually, and the failure would be silent,
because both choices produce a number in the right range.

| Thing | Value | Where |
| --- | --- | --- |
| Judge model | `gemini-2.5-flash` | `POLICY_JUDGE_MODEL` |
| Timeout | 3 s, per rule | `POLICY_JUDGE_TIMEOUT_MS` |
| Default threshold | 0.7 | `DEFAULT_POLICY_THRESHOLD` |
| Active **operator** policies per stage | 3 | `MAX_ACTIVE_LLM_POLICIES` |

All four are constants in `packages/guardrails`, read by both runtimes. None is
configurable, and that is deliberate: two runtimes asking a different model a
different question would be two products, and the public API is the one nobody
would notice was wrong.

**Policy rules run last, concurrently, and capped.** Last because they are the
expensive kind — a local pattern or a moderation endpoint that already refuses
the turn should not be preceded by one model call per rule. Concurrently
because three rules at the timeout would otherwise be a nine-second wait before
the model is asked the question. Capped because concurrency bounds the latency
and nothing bounds the *spend*: a fourth policy rule is a fourth model call per
turn, for ever. Rules the cap left out are reported, the same way a rule the
pattern budget skipped is.

**The cap counts operator-authored policies and never the built-in.** Counting
everything judged would let an organization's own three policy rules push
`jailbreak-detection` past the cap and switch the platform's detector off —
silently, and through a change that was not about jailbreak at all.

**A judge that cannot answer is a pass, and is logged rather than recorded.** A
timed-out judge and a judge that read the message and found nothing are the
same score and different events; filing the first as a hit would put a row on
the incidents page for every provider blip, and make this page's hit counts
describe the provider rather than the rule set.

**What the judge costs shows on the AI-usage page under `GUARDRAIL`.** Its own
step, not folded into `MODERATION`, because "what did the guardrails cost" is
the question an operator asks precisely about the expensive kind of rule. A
timed-out judge records nothing — there is no usage to record — which the
provider may still bill for; that is the honest limit of measuring this from
the client side.

### Writing one, and trying it before you turn it on

The rule form takes the prose and the threshold, states the cap where you meet
it, and carries a **"test this policy"** box: paste a message, and it comes
back with the score, the threshold that was applied, and whether the rule would
have fired.

Three things about that box are worth knowing, because each of them is a way it
could have been misleading:

- **It runs the judge in `apps/web`, not in the panel.** The panel posts to
  `/api/internal/guardrails/judge-policy` with the shared internal secret, and
  that endpoint re-reads the named administrator from the database and checks
  the platform role again — the secret alone would let anything holding it
  spend money on a judge model. `apps/web` is a runtime that serves chat, so a
  trial exercises the binding real traffic passes through. A judge in the panel
  would be a third binding, with its own model id and its own timeout, and you
  would tune a threshold against a number no turn ever produces.
  `guardrails-are-not-recopied` asserts there are exactly two judge bindings;
  that assertion is the record of this decision.
- **It masks the text first, when this installation masks.** The input stage
  runs downstream of Presidio, so the judge never sees a phone number. The box
  shows you what the judge actually read, which is the same caveat as the one
  under the policy field, in a form you can act on. If masking is on and the
  analyzer does not answer, the trial is *not run* rather than run against raw
  text.
- **It writes no AI-usage row.** `AiUsage.organizationId` is required, and a
  platform administrator testing a draft has no tenant to bill — inventing one
  would put a number on some organization's page that nobody in it caused. The
  provider still bills for these calls, and the only record is the admin audit
  entry `admin.guardrail.policy_tested`. That is a real limit, and it is why
  trials are audited at all.

The prose and the pasted message stay out of the audit entry and out of the
logs: it records the outcome, the threshold and the score. A judge failure is
described rather than logged whole, for the reason in
`docs/lessons.md` — a provider error carries the request body, and the request
body is the customer's message.

**A threshold you leave empty means "the rule names none"**, which is what
makes the default apply. It is stored as `null` and never as `0` — a threshold
of zero matches every message.

### Tuning a built-in detector

`jailbreak-detection` is judged by a model like a policy is, so it has a
threshold too, and the rule form offers it. What you cannot change is the
question: a built-in's prompt is fixed in code, and only how sure it has to be
is yours. Until this shipped the column existed, the resolver read it, and
nothing but SQL could set it — the detector ran at whatever the migration
seeded.

`content-moderation` has no such field, and that is not an omission. It asks a
provider endpoint that answers with a flag rather than a score, so a threshold
on it would be a number you could set and nothing would read. **Which built-ins
are scored is a list of keys** (`SCORED_BUILT_IN_KEYS`), not a property of the
kind — the same per-key distinction `EVALUABLE_BUILT_IN_KEYS` exists for, and
for the same reason: two built-ins of the same kind differ in how their verdict
arrives.

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

**Two of these values the resolver reads and no page can yet write.** An
override's `action` and `threshold` are both honoured — validated, with their
own `dropped` reasons when they are out of range or incoherent — but
`setGuardrailOverrideAction` writes `enabled` and nothing else.

This is the *opposite* of the failure the rest of this page is about. Nothing
is silently unenforced — the code is a knob with no handle, and it reads as
though the feature is there. "Keep the platform's rule, but only log it for us"
is the thing an override exists for and the panel cannot express it yet. It is
C4b in the spec, and it is called out here rather than left for somebody to
deduce from a schema.

A third one is now closed: a scored built-in's own `threshold` on the platform
rule — see [Tuning a built-in detector](#tuning-a-built-in-detector) above. A
link rather than a direction, because that section sits earlier on the page and
"below" was already wrong the day it was written.

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

**One call site per side per app is what made C2 worth doing.** The jailbreak
classifier it absorbed was called from two routes in `apps/web` and from
nothing in `apps/api`, so the rule resolved for API traffic and was enforced
by nothing there — a gap nobody would find from a screen. Moving it into the
loop covered the public API without a line of API-specific code.

**Which surface a hit is filed under is the caller's to say.** The web chain
reads `config.guardrailSource`, defaulting to `chat`; the chatbot route passes
`chatbot`, and `apps/api` passes `api`. `initializeRagChain` serves four
surfaces, so a hit from the widget filed as `chat` is a hit an operator cannot
find when they filter the incidents page by the surface they are worried
about.

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
and a **match count** — plus, for a policy rule, the judge's **score**. It
never carries the matched text, and it never carries the judge's prose reason,
which is why the judge is not asked for one: that is the
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
