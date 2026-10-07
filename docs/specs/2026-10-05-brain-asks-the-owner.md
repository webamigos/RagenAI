---
title: Brain asks the person who knows, and keeps the reply as evidence
status: approved
areas: [brain, knowledge-base, connectors, notifications]
adrs: [38, 39, 42, 50]
---

# Brain asks the person who knows

## TLDR

When a finding cannot be settled from the documents (a GAP, a contradiction
with no newer source, a stale page whose owner has to confirm it), the operator
sends a question to a named person from inside Brain. The reply comes back into
Brain, and the change it justifies cites it the way a page cites a source span.
The non-obvious part is that **the reply is evidence, not a decision**: it
carries the answerer's name and the time into the ledger, but the change itself
still goes through the operator's approve/merge/verify, so D6 ("only through
human acceptance") holds and no message, wherever it arrives from, can change a
page by itself.

## Open Questions

<!--
Hard gate (docs/specs/README.md): no code until these are answered.
-->

- **Q1. Is this one capability or two?** "Ask and record the reply inside
  Ragen" works without Slack. "Deliver the question over Slack/Teams" is a
  delivery channel on top. Proposal: **split**, so this spec is in-app + email
  and Slack gets its own spec once Q3 is decided. Yes / no?
  **Answer (2026-10-07): split. This spec is in-app + email; Slack/Teams delivery gets its own spec.**
- **Q2. Who can be asked?** (a) only members of the organization, who have a
  `User` and can sign in to answer, or (b) also people without a Ragen account,
  identified by email or Slack user. (b) means an unauthenticated answer link,
  and the "name on the evidence" is then a claimed name, not a signed-in user.
  Proposal: **(a)** for v1.
  **Answer (2026-10-07): (a) members of the organization only.**
- **Q3. If Slack is in scope, which mechanism?** (a) the operator's own Slack
  connection (`features/connectors/providers/slack.ts`, Slack's hosted MCP,
  per-user OAuth). The message is sent as the operator, and the reply is read
  back by polling the thread. No new Slack app, but polling needs the
  operator's token outside a request. (b) a Ragen Slack app with a bot user and
  the Events API: a webhook route, new secrets, and a workspace admin install.
  Proposal: decide only if Q1 = no.
  **Answer (2026-10-07): out of scope here, because Q1 = split. Decided in the Slack spec.**
- **Q4. Is an answer a page source?** (a) an answer can be cited by a page
  beside document spans. `KnowledgePageSource.fileId`/`documentVersionId`
  become nullable and a source has a kind. (b) the answer is attached to the
  `KnowledgeDecision` it justified, and pages still cite documents only.
  (a) is what the LinkedIn framing means by "the reply is the evidence"; (b) is
  a much smaller change. Proposal: **(b)** first, (a) when a page needs to say
  "per Anna, 2026-10-05" in its own text.
  **Answer (2026-10-07): (b) the answer attaches to the `KnowledgeDecision`; (a) later, when a page needs to say it in its own text.**
- **Q5. Does the owner's answer verify the page?** When the person asked is the
  page's `ownerId` and confirms the page, should applying it reset
  `lastVerifiedAt` (a `VERIFY` decision by the operator *citing* the answer),
  or should only the owner's own click verify? Proposal: the operator's
  `VERIFY`, with the answer attached.
  **Answer (2026-10-07): the operator's `VERIFY`, citing the answer.**

## Problem

Brain can say *that* something is wrong but not settle it when the documents
do not hold the answer:

- **A GAP** (today: a `PROCESS` page with no edge to a `ROLE` page) is, by
  definition, something the sources do not say. U10 in the
  [operator assistant spec](2026-09-25-brain-operator-assistant.md) drafts
  questions for the owner, and then the operator **copies them out of Ragen**.
  Whatever comes back lives in someone's inbox, and the change it justified
  shows up in the ledger with no reason attached.
- **A CONTRADICTION** between two sources of the same age has no tiebreaker in
  the corpus. The operator picks one, and the ledger records who picked, not on
  whose authority.
- **A STALE page** asks the owner to re-confirm it. Today only a user with
  `manageBrain` can press Verify, and the owner is often not that person.

The ledger (`KnowledgeDecision`) names the operator who acted. Nothing in the
system records *who said the content is right*, which is the question an
auditor, or the next operator, actually asks.

## Out of scope

- **The assistant sending questions on its own.** It drafts (U10 already does),
  the operator sends. Same rule as every other proposal.
- **Applying an answer automatically.** An answer never changes a page; see
  TLDR.
- **Mining chat threads for questions to ask.** That is rule 1 of the same
  LinkedIn post and has its own privacy question (ADR-42, no impersonation).
  Separate spec.
- **Teams.** There is no Teams connector in the catalogue today.
- **Slack**, if Q1 is answered "split".

## Proposed solution (sketch, to be completed after the gate)

1. **Ask.** From a finding or a page, the operator opens "Ask someone",
   picks a member (Q2), and edits the question, prefilled from U10 when the
   assistant drafted one. Sending creates a `KnowledgeQuestion` row and
   notifies the recipient in-app (`sendNotificationToUser`, a new
   `NotificationType`) and by email (the existing mailer).
2. **Answer.** The recipient opens a narrow answer view. They see the question,
   the page's title and the quoted spans the question is about, but *only
   spans whose source they could already read* (the page's `accessibleBy`
   intersected with theirs). They answer in free text. Answering does not need
   `manageBrain`.
3. **Fold in.** The answer appears on the finding/page. The operator assistant
   reads it and proposes the change (an edit draft, resolve, verify, set
   owner) as a proposal card, the same as today. The operator applies it.
4. **Evidence.** The resulting `KnowledgeDecision` carries `questionId` (Q4b),
   and the ledger view renders "on the answer of <name>, <date>" with the text.

Alternatives considered:

- **A comment thread on the page instead of a question entity.** Rejected:
  a question has a recipient, a state (open/answered/expired) and is linked
  from the decision. A comment has none of these, and "unanswered questions
  older than a week" has to be a query.
- **Letting the owner apply the change themselves.** Rejected for v1: it
  creates a second approval path beside `manageBrain`, which is what D6 avoids.

## Core surfaces touched

| Surface                 | Change                                                                                          | What catches a mistake                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `prisma/schema.prisma`  | `KnowledgeQuestion`, `KnowledgeDecision.questionId`, a `NotificationType` value                  | migration + `npm run verify`                 |
| tenant scoping          | `KnowledgeQuestion` is org-scoped; the answer view must check the recipient, not only the org    | tenant-scope guard (warns), command tests    |
| auth / roles            | answering needs recipient identity, not `manageBrain`; asking needs `manageBrain`               | capability tests (ADR-39), no inlined roles  |
| `packages/brain-contracts` | question/answer shapes if the bundle export carries them                                     | package tests                                |

## Data model (draft)

`KnowledgeQuestion`: `organizationId`, `publicId`, `pageId?`, `findingId?`
(at least one), `askedById`, `recipientId`, `body`, `status`
(`OPEN | ANSWERED | CANCELLED | EXPIRED`), `answer?`, `answeredAt?`,
`createdAt`. `askedById` and `recipientId` are plain columns, like
`KnowledgeDecision.actorId`: the evidence has to name the person after they
leave. An answer is immutable once written (same trigger idea as the ledger).
A correction is a second question. Existing decisions get `questionId = null`.

## Failure modes

- **Recipient loses access to the page's sources between ask and answer.** The
  answer view re-checks on open, so they see the question without the spans.
- **Recipient leaves the organization.** The question expires and the operator
  is told. A written answer stays, with the name as written.
- **Page merged or rejected while a question is open.** The question follows a
  merge to the surviving page, and is cancelled on rejection.
- **Answer contains PII or a secret.** It is shown to operators only. Before it
  reaches the assistant's model it is masked like any chat input.
- **Prompt injection in an answer.** The answer is data to the assistant. It
  can only produce a proposal, which a person applies.

## Phases (draft)

### Phase A: ask and answer, in-app

- [ ] **A1.** `KnowledgeQuestion` + migration; ask/answer/cancel commands with
      tests; feature key `brainQuestions`, default `false` (ADR-50).
- [ ] **A2.** Ask dialog on finding and page; answer view; in-app notification.
- [ ] **A3.** Email delivery with a signed-in link.

### Phase B: the answer as evidence

- [ ] **B1.** `KnowledgeDecision.questionId`; ledger renders the answer.
- [ ] **B2.** Operator assistant reads answers and proposes from them; U10's
      draft becomes "Send as a question" instead of "copy".

## Testing

Unit tests for the commands (recipient checks, immutability, cross-org
refusal). An integration test that an answer from user B is not visible to
user C in the same org without `manageBrain`. One `p0-*` e2e: ask, answer as
another user, apply, and see the name in the ledger.

## Rollout and rollback

Behind `brainQuestions` (requires `brain`). Additive migration: rolling back
means switching the key off. The table stays and the decisions keep a null-able
column.
