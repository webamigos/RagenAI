---
title: Personal memory across a user's threads
status: in-progress
areas: [chat, worker, auth, guardrails]
adrs: [02, 06, 20, 38, 39, 42, 44, 50]
---

# Personal memory across a user's threads

## TLDR

Panel chat remembers what a user has told it about themselves: their
preferences, their role, what they are working on. A new thread starts with that
context instead of from nothing. The memory is extracted from the user's own
messages by a worker job, shown to the user and editable by them, and never
becomes a second source of organizational knowledge. The non-obvious part is
that a memory outlives the thread it came from, so ADR-42's per-thread key
cannot protect it. This spec adds a second key owner: one key per user in each
organization.

## Decisions

Answered by the product owner on 2026-09-27, before any code:

- **Scope is per user per organization.** The same person in two organizations
  has two memories, and nothing crosses between them.
- **Memories are encrypted under a per-(user, organization) DEK.** It comes from
  the same key provider as a thread DEK, and ADR-42 is amended to say so (see
  "Encryption"). Per-org KMS keys (ADR-02) are still deferred. The new key
  inherits that: it is wrapped by the one installation-wide provider, exactly
  as a thread DEK is today.
- **Panel chat only in the first release.** Out: the chatbot embed, the public
  API, the MCP server, public threads and the Brain operator assistant.
- **Writing is automatic, visible and undoable.** A new or changed memory shows
  in the thread with an undo. A per-user switch turns extraction off.
- **Deleting a thread deletes the memories it last wrote.**
- **A memory is visible only to its user.** An org can switch the feature off,
  but no org role and no platform admin can read memories.
- **Promoting a memory to Brain is a separate spec.** This spec keeps the
  provenance that spec would need, and nothing more.
- **Built in-house, not on mem0.** See "Alternatives considered".

## Problem

Every thread starts cold. A user who has said "answer in bullet points", "I am
the CFO, skip the implementation detail" or "we are preparing the X tender this
month" has to say it again in each new thread. Neither knowledge layer Ragen
has today can hold it:

- **Documents (RAG)** hold what the organization uploaded, word for word.
- **Brain** holds organizational knowledge that a person has reviewed and
  approved (`apps/web/src/features/brain`).

Both belong to the organization and are curated. Nothing belongs to one user
and gets collected without anyone curating it. The locale files already carry
an unused `status-searching-memories` string ("Searching memories..."). It is
the only trace of the idea in the codebase today.

## Out of scope

- **Organizational facts.** "Our VAT rate for X is 8%" is knowledge, not a
  preference. It belongs in documents or Brain. The extraction prompt is told
  to drop it, and nothing in this spec writes to Brain.
- **Memory inside connectors.** A connector does not keep its own memory. Data
  from rejestr.io, HubSpot and similar sources has an authoritative source and
  goes stale. It needs a cache with a TTL or an entity row, as the leads
  enrichment already has, not a memory. How a user *uses* a connector ("my
  pipeline is called Sales EU") is an ordinary memory, stored in core like any
  other.
- **Memory about chatbot-embed visitors.** This is mem0's headline use case
  (customer support: the bot remembers a returning customer's issues and how
  they were resolved). For us it is a separate capability with a hard
  precondition. The chatbot's `visitorId` is still the client-supplied
  `sessionId` (`docs/chatbot-integration-followups.md`, item 7, "HMAC-signed
  session tokens"). Keyed by that id, memory would hand one visitor's history
  to anyone who presents their id. It needs signed visitor identity from the
  host site first, and a spec of its own.
- **Recurring issues across users.** mem0 lists this as a memory feature. Here
  it is analytics over questions and gaps, which belongs to
  [knowledge analytics](2026-09-08-knowledge-analytics-beyond-citations.md),
  not to anyone's personal memory.
- **Memory for an assistant or a project.** An assistant's persistent
  instructions are its system prompt, and a project has project instructions.
  Both exist already.
- **Extraction from the assistant's answers.** Only what the user wrote is read.
  See "What the extractor sees" for why.
- **Semantic search over memories.** A user's memory is loaded whole (see
  "Reading"). Qdrant is not involved until someone measures a user with too
  many memories to load whole.
- **Per-org KMS keys.** ADR-02 remains deferred. When it lands, the memory key
  moves with the thread key, and this spec does not do that work early.
- **A usage ceiling for every worker job.** The worker checks no monthly
  ceiling today, and this spec needs one for its own job. The shared piece this
  requires is its own PR (B1). Wiring the check into Brain extraction and
  summaries is not done here.

## Proposed solution

### What a memory is

A memory is one short statement in the third person, about the user, useful in
a future thread: "Prefers answers as bullet points." "Is the CFO; wants
figures, not implementation detail." "Is preparing the X tender, due
2026-10-15." A user has at most `MEMORY_MAX_ENTRIES = 50` memories, and each is
at most 300 characters. At that size the whole memory fits in about 4k tokens,
which is why it is loaded whole.

The extraction prompt keeps only three kinds of statement, and each has test
cases in the eval (see "Testing"):

1. **Preferences about answers:** format, length, language, tone.
2. **The user's role and context:** job, team, what they are responsible for.
3. **Ongoing work,** with a date where one is given. A dated memory gets an
   `expiresAt` 30 days after that date, and is neither read nor listed after
   it.

It drops everything else, and explicitly: facts about the organization, facts
about third parties, anything the user asked the chat to find out, and
anything containing a PII placeholder.

### Who a memory belongs to: the thread's owner, and only in their own thread

The gate below requires that **the session user is the thread's owner**, using
the same owner predicate `apps/api/src/threads/thread-core.service.ts` uses for
`ownThreadWhere`. It also requires that the thread has **no `teamId`, no share
and no public link** at the time of the turn.

The chat loads a thread by org, not by owner (`getThreadDetails(publicThreadId,
orgId)` in `assistant-stream.ts`). Threads can also be shared, belong to a
team, or have a public link. Without this rule, three things break:

- a reader of someone else's thread would get the owner's memory, or write into
  it;
- an answer shaped by one person's memory would be saved into a thread others
  can read;
- deleting one person's thread would delete another person's memories.

If the owner shares a thread *after* memory shaped an answer in it, what they
share is their own conversation. That is their choice, and it is no different
from sharing something they typed. The share dialog does not warn about it in
this release.

### Writing: a job after each turn

1. **Enqueue.** After `createMessageInDB` saves the assistant message
   (`apps/web/src/app/api/threads/services/assistant-stream.ts`, near the
   `recordKnowledgeUsageCommand` call), the chat starts a `memoryExtract` job
   through `jobs().start(...)`. It is fire-and-forget: a failed enqueue is
   logged and never fails the turn. It copies
   `features/brain/services/commands/start-findings-reconcile.ts`.
2. **Gate.** The job is enqueued only when all of these hold:
   - the thread is `kind: CHAT`, `source: UI` and has no `chatbotId`;
   - the ownership rule above holds;
   - the org has the `personalMemory` feature on;
   - the user has not switched extraction off;
   - the turn was not refused by a guardrail or a usage ceiling.

   The gate is one function, with a unit test per condition.
3. **Job id.** `memory-<messageId>`. This deduplicates a repeated `start()` for
   the same turn, and nothing more. Two turns in quick succession are two jobs
   that may run at once, and step 6 serializes them.
   `apps/worker/src/job-ceilings.ts` cannot do it: it caps a job name across the
   deployment, not per key, and a cap of 1 would make every user wait for
   every other user.
4. **Check the ceiling.** Before calling a model, the handler checks the org's
   monthly usage ceiling (B1). An org over its ceiling gets no extraction, and
   the skip is logged. "A limit is a call site" (AGENTS.md) is why this is a
   step and not a note. The check and the usage record are not atomic, so jobs
   in flight at the moment an org crosses its ceiling can overshoot it by at
   most one extraction call each. That is the same check-then-record semantics
   the chat surfaces have today (`assert-within-usage-limits.ts`), and a
   reservation scheme for the cheapest call in a turn would be stricter than
   the chat call it follows. If ceilings ever become hard limits, they become
   hard everywhere, and not here first.
5. **Extract.** One model call on `MEMORY_EXTRACT_MODEL`, which falls back to
   `SUMMARY_MODEL` as `BRAIN_EXTRACT_MODEL` does (`apps/worker/src/consts.ts`).
   The call goes through `getChatModelForOrg`. The input is:
   - the user's current memories, decrypted;
   - the user's message.

   The output is a structured list of operations: `ADD { content }`,
   `UPDATE { id, content }`, `DELETE { id }`. It is parsed with a Zod schema,
   and an unparseable answer is a no-op, not a retry. The schema enforces the
   bounds rather than trusting the prompt with them:
   - `content` is 1–300 characters after trimming;
   - at most 10 operations per answer.

   An operation that violates a bound is dropped on its own, and the rest
   apply. A test covers a 301-character `content`.
6. **Apply.** Before the transaction, and without writing anything, resolve a
   key and encrypt every content to be written (ADR-42's rule: no lock held
   across a KMS round-trip). If the profile exists and has a key, that key is
   unwrapped. Otherwise a new DEK is generated but not saved. Then open one
   transaction, and do everything that writes inside it:
   1. Check that the user is still a member of the org (a read of `members`,
      never a write).
   2. Upsert the profile. When the job brings a new DEK, store it with a
      conditional `encryptedDek IS NULL`. If another writer stored a key first,
      the job rolls back and retries once, re-encrypting under that key.
   3. Take `SELECT … FOR UPDATE` on the profile row.
   4. **Re-check that the job is still wanted.** The enqueue-time gate is
      minutes old by now.

   Because the upsert is inside the transaction, a failed check rolls it back
   too, and a queued job cannot recreate a removed member's profile. The
   checks in step 4 are:
   - `extractionEnabled` is still true;
   - the profile's `epoch` equals the one the job was enqueued with (see
     below);
   - `personalMemory` is still on for the org.

   The `epoch` is an integer on the profile. The web app reads it when it
   enqueues, and puts it in the payload (0 when no profile exists yet).
   "Forget everything" and switching extraction off both increment it, in the
   same transaction as the change. Member removal deletes the profile, and the
   membership check in sub-step 1 stops a job for a removed user from recreating one.
   So a job paused across any of these controls cannot write afterwards.
   Otherwise, the operations are applied:
   - an `UPDATE` or `DELETE` whose row changed since it was read (by
     `updatedAt`) is skipped, so a user's edit made mid-job wins;
   - an `ADD` identical to an existing statement after normalisation is
     skipped;
   - `MEMORY_MAX_ENTRIES` is enforced: an `ADD` beyond the limit is dropped and
     logged, and old memories are never evicted silently;
   - every applied operation writes a `UserMemoryChange` row (see "Data
     model"), which carries the previous content for undo.

   Two concurrent extractions can still leave two differently worded versions
   of one statement. The next extraction sees both and is prompted to merge
   them.
7. **Record usage.** Usage is recorded under a new `AiUsageStep.MEMORY`, so the
   AI-usage page can answer what memory costs.
8. **Result.** The job result carries counts only, never content, because job
   results sit in Redis for an hour under the global `RETENTION`
   (`packages/jobs-bullmq/src/index.ts`). The thread reads what changed from
   `UserMemoryChange` by `messageId` in Postgres.

### What the extractor sees

**Only the user's message, as the answering model saw it.** That means after PII
masking (`piiResult.maskedText`) and after the input guardrail. It never sees
the raw prompt, and never sees the assistant's answer.

Excluding the answer is deliberate, for three reasons:

- **The answer can carry real personal data that was never masked.** It
  includes names from MCP tool results (`applyPiiUnmaskToTools`) and from
  retrieved documents. These are not placeholders, so no filter can recognise
  them, and a prompt alone is not a boundary.
- **The masked answer does not exist after the stream.** `fullMessage`
  accumulates unmasked deltas, so using it would mean rebuilding it.
- **A memory is what the user said about themselves.** The answer is not that.

What is lost: "yes, always do it like that", where the preference is only
readable against the previous answer. That is accepted for the first release,
and the eval measures how often it matters.

Masked messages carry placeholders such as `<PERSON_1>`. Those are per turn and
mean nothing in another thread, so a statement containing one is dropped by the
prompt, and again by a pattern check before the write. With masking on, a user
who says "my name is Anna" gets no memory of it. That is the correct result:
masking was turned on so that the name does not reach a model.

The stored user message holds the raw prompt, so the handler cannot re-read it.
Instead, `assistant-stream.ts` encrypts the masked, guarded question with the
thread's DEK through `maybeEncryptContent`, and puts it in the payload. The
handler decrypts it with the thread's key, as the worker already does for
documents. When encryption is on, Redis never holds the text in plaintext. When
it is off, the same text is plaintext in Postgres anyway. A failed job's payload
stays in Redis for 24 hours under the global `RETENTION`. That cannot be set per
job, and in either mode it is no weaker than the message table.

### Reading: a block in the system prompt

At the start of a turn that passes the same gate (minus the guardrail
condition, which is not known yet), the user's memories are loaded (those whose
`expiresAt` has not passed), decrypted, and rendered as a bounded block:

```
What you know about the user from earlier conversations (they can edit this;
treat it as their preference, not as a fact about the organization):
- Prefers answers as bullet points.
- …
```

The block is injected beside `projectInstruction`, in both chains'
`systemTemplates.answerChain` (`libs/chains/basic-rag/operations.ts`,
`libs/chains/conversation-chain/operations.ts`), as a new config field passed
from `assistant-stream.ts`. It is *not* part of `{context}`. Retrieved
documents and memory are different sources, and a citation must never point at
a memory.

When encryption is on and the key cannot be read, the turn runs without memory
and logs a warning. Memory is never a reason for a turn to fail.

### Encryption

A new module, `packages/crypto/src/owner-key.ts`, resolves a DEK for an owner
that is not a thread. It is written against a small storage interface
(`load(): encryptedDek | null` and `saveIfAbsent(encryptedDek)`), so both the
web app (a user editing a memory) and the worker (extraction) resolve the key
the same way. The race on first use is handled the way `maybeEncryptContent`
handles it: a conditional update where `encryptedDek IS NULL`, then re-read.

**Each row records whether it is encrypted** (`UserMemory.isEncrypted`,
`UserMemoryChange.isEncrypted`). Threads can infer this from the key alone,
because a thread without a DEK is plaintext end to end, and
`decryptMessageContents` decrypts every row once a DEK exists. A profile can
have plaintext rows written while encryption was off, and gain a key later.
`decryptContent` throws on plaintext, so inferring from the key would make
every older memory unreadable the moment the first encrypted one was written.
Reads decrypt only the rows flagged as encrypted.

**ADR-42 is amended, not bypassed.** Today it says derived content is
encrypted "under the same key as the message it belongs to". A memory belongs
to no single message. The amendment says:

- The key is chosen by the content's **owner**: a thread for everything that
  exists today, and a (user, org) profile for a memory.
- There is one function per owner kind, and both are built on the same
  primitives in `packages/crypto`.
- `tests/architecture/encryption-lives-in-one-package.test.ts` gains the new
  module's path.

**Failure behaviour differs from ADR-42, on purpose.** ADR-42's derived content
"follows the message down" to plaintext when the DEK cannot be obtained,
because a snippet stored beside a plaintext answer protects nothing. A memory
has no message beside it. It is read in *other* threads, which may be
encrypted. So when encryption is enabled and the owner key cannot be obtained,
the memory is **not written**. Losing one extraction costs nothing, and writing
plaintext beside encrypted threads is the divergence ADR-42 exists to prevent.
When encryption is disabled for the installation, memories are plaintext,
exactly like messages.

**"Forget everything" deletes rows; it is not a crypto-shred.** It deletes every
memory and change row, and clears the profile's `encryptedDek`, in one
transaction. It keeps the profile row, so `extractionEnabled` survives: a user
who opted out stays opted out after forgetting. No guarantee is claimed beyond
the row delete. The DEK cache in `packages/crypto` is process-wide, so a
running process may keep a plaintext key it can no longer use.

### The per-user boundary is enforced in one place

The tenant-scope guard checks one column per model (`TENANT_SCOPED_MODELS`),
only warns, and does not run in the worker. It can see a missing
`organizationId`. It cannot see a missing `userId`, which is the boundary this
feature depends on. So:

- In apps/web, every read and write of `userMemory`, `userMemoryProfile` and
  `userMemoryChange` goes through one module,
  `features/memory/services/memory-scope.ts`. Its functions take a
  `MemoryOwner` built only from the session (`getOrgIdFromAuthOrThrow()`,
  `getCurrentUserId()`), never from arguments.
- In apps/worker, the models are touched only in the memory activity module.
- The org admin's "delete all members' memories" is the one operation that is
  not per user. It gets a second, separate scope in the same module: an
  `OrgMemoryAdmin` built only from the session's org, and only after
  `canManageOrg()` passes. That scope exposes a single function,
  `deleteAllOrgMemories`. It has no read, and it takes no user id, so no
  admin path can list or load a member's memory. Its authorization test
  asserts that a member without `canManageOrg()` gets `Unauthorized`, and
  that another org's rows are untouched.
- A new architecture test,
  `tests/architecture/memory-rows-are-read-through-one-module.test.ts`, fails
  on a reference to those three Prisma models anywhere else. It also fails if
  `OrgMemoryAdmin` gains any function that selects `content`.
- The models are also added to `TENANT_SCOPED_MODELS`, which covers the org
  half of the boundary.

### The user's view

- **Where.** A settings page, `settings/memory`, in the `you` group of
  `features/settings/registry.ts`, with `requireRole: 'user'`.
- **What it shows.** The user's memories, newest first. Each shows the thread
  it came from, as a link, or "deleted thread" once that thread is gone. Each
  can be edited or deleted.
- **Controls.** "Forget everything" (with a confirmation) and the extraction
  switch. Switching extraction off does not delete existing memories. The page
  says so and offers "forget everything" beside it.
- **When the org has `personalMemory` off,** the page stays reachable with
  deletion only: no list, no edit. A user can always erase what is kept about
  them, which is an erasure right, not a feature. The same holds when the org
  has `deleteThreads` off: deleting the thread is then unavailable, and
  deleting the memory directly is always available.
- **In the thread.** After a turn that changed memory, a line under the answer:
  "Remembered: prefers bullet points · Undo". It is read from
  `UserMemoryChange` by `messageId`. Undo reverts that one change: an `ADD` is
  deleted, and an `UPDATE` or `DELETE` restores the previous content. **An
  undo is refused when it is stale.** Every write to a memory increments
  `UserMemory.version`, and each change row stores the version it produced
  (`resultVersion`):
  - for an `ADD` or `UPDATE`, undo requires the memory's current `version` to
    equal `resultVersion`;
  - for a `DELETE`, undo requires that no memory with that `publicId` exists.

  A later extraction or a settings edit therefore cannot be overwritten or
  deleted by an older undo. The line then shows "changed since, edit it in
  settings" instead of the undo button. The
  unused `status-searching-memories` key is reused if the stream shows a
  loading status for memory, and deleted otherwise.
- **For an org admin.** "Delete all members' memories" in organization
  settings, guarded by `canManageOrg()`. It deletes without reading, for an
  org that turns the feature off for good.

### Alternatives considered

- **mem0 as a library.** Rejected. It stores the extracted text in plaintext, in
  its own vector store. That is a second write path for thread content outside
  `packages/crypto`, which ADR-42 exists to prevent. It also has no notion of an
  organization, so tenant scoping would be bolted on around it. What it adds
  over the existing stack (BullMQ, the route table, the encryption package) is
  one prompt and one merge step. This spec reimplements both.
- **mem0 / OpenMemory as an MCP connector.** Remains possible for anyone who
  wants it, per ADR-38, and needs no work here. It is not the product feature:
  its encryption and tenancy guarantees are the server's, not Ragen's.
- **Memory stored per connector.** Rejected. It splits memory across as many
  stores as there are connectors. Each one would have to solve encryption,
  scoping and erasure on its own.
- **Extraction in the web process, after the response.** This would be like
  `recordKnowledgeUsageCommand`: no worker, and the existing encryption
  function. Rejected. It has no retry, and runs a model call inside the request
  process. The per-user write serialization would be the same work anyway.
- **Extraction from the whole turn, answer included.** Rejected, because the
  answer carries unmasked personal data from tools and documents (see "What the
  extractor sees").
- **Memories in Qdrant with vector retrieval.** Rejected for now. Fifty short
  statements load faster from Postgres than a search returns. Vector retrieval
  would also mean a second decrypt-after-search path.
- **One DEK per memory row.** Rejected. It is a KMS round-trip per statement on
  every turn, for no isolation that matters: all rows have one reader.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `prisma/schema.prisma` | Three new models, one enum value (`AiUsageStep.MEMORY`) | migration on a throwaway DB + `npm run verify` |
| `packages/crypto` | New `owner-key.ts`, used by web and worker | package tests + `encryption-lives-in-one-package.test.ts` |
| `packages/platform-contracts` | Feature key `personalMemory`; three models added to `TENANT_SCOPED_MODELS` | `features.test.ts`, the tenant-scope map's schema cross-check |
| usage limits | The limit evaluation moves to a package both web and worker import (B1) | the existing web ceiling tests stay green unchanged; a new worker call-site test |
| `packages/jobs` | `memoryExtract` in `JOB_NAMES`, with payload and result types | the `JobHandlers` map in `apps/worker/src/bullmq-runtime.ts` is a compile error when a handler is missing |
| `apps/web` chat stream | Enqueue after the turn; memory block in both chains | unit tests on the gate; `p0-35` (see "Testing") |
| ADR-42 function | Amended, not changed, for threads | its existing tests stay green unchanged |
| auth / tenant scoping | Per-user boundary in one module | `memory-rows-are-read-through-one-module.test.ts` + an IDOR unit test per function |
| Better Auth membership | A trigger on `members` deletes a removed member's profile (A0; pending decision) | a migration test that each of the four removal paths leaves no profile |
| `apps/api` thread deletion | None: the FK cascade does it (see "Data model") | a test in `thread-core.service` that deleting a thread deletes its memories |

## Data model

```prisma
/// One per (user, organization) that has ever had a memory. Holds the key and
/// the user's switch, because there is no per-user preference model to put
/// the switch in. "Forget everything" keeps this row.
model UserMemoryProfile {
  id                Int                @id @default(autoincrement())
  organizationId    String             @map("organization_id")
  userId            String             @map("user_id")
  encryptedDek      String?            @map("encrypted_dek")
  extractionEnabled Boolean            @default(true) @map("extraction_enabled")
  /// Incremented by "forget everything" and by switching extraction off. A
  /// job enqueued under an older epoch writes nothing.
  epoch             Int                @default(0)
  createdAt         DateTime           @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime           @updatedAt @map("updated_at") @db.Timestamptz
  memories          UserMemory[]
  changes           UserMemoryChange[]

  @@unique([organizationId, userId])
  @@map("user_memory_profiles")
}

model UserMemory {
  id             Int               @id @default(autoincrement())
  publicId       String            @unique @default(uuid()) @map("public_id") @db.Uuid
  organizationId String            @map("organization_id")
  userId         String            @map("user_id")
  profileId      Int               @map("profile_id")
  profile        UserMemoryProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  content        String
  isEncrypted    Boolean           @map("is_encrypted")
  /// Incremented on every write; what a stale undo is detected by.
  version        Int               @default(1)
  /// The thread that last wrote this row. Deleting it deletes the row.
  sourceThreadId String?           @map("source_thread_id") @db.Uuid
  sourceThread   Thread?           @relation(fields: [sourceThreadId], references: [id], onDelete: Cascade)
  expiresAt      DateTime?         @map("expires_at") @db.Timestamptz
  createdAt      DateTime          @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime          @updatedAt @map("updated_at") @db.Timestamptz

  @@index([organizationId, userId])
  @@index([sourceThreadId])
  @@map("user_memories")
}

/// One per operation an extraction applied. It is what the thread's
/// "Remembered · Undo" line reads, and what undo restores from.
model UserMemoryChange {
  id              Int                  @id @default(autoincrement())
  publicId        String               @unique @default(uuid()) @map("public_id") @db.Uuid
  organizationId  String               @map("organization_id")
  userId          String               @map("user_id")
  profileId       Int                  @map("profile_id")
  profile         UserMemoryProfile    @relation(fields: [profileId], references: [id], onDelete: Cascade)
  /// The assistant message whose turn produced this change.
  messageId       String               @map("message_id")
  sourceThreadId  String?              @map("source_thread_id") @db.Uuid
  sourceThread    Thread?              @relation(fields: [sourceThreadId], references: [id], onDelete: Cascade)
  memoryPublicId  String               @map("memory_public_id") @db.Uuid
  operation       UserMemoryOperation
  /// The content before an UPDATE or DELETE, and the new content after an ADD
  /// or UPDATE, encrypted like the memory. Needed after a DELETE, when the
  /// memory row no longer exists.
  previousContent String?              @map("previous_content")
  newContent      String?              @map("new_content")
  isEncrypted     Boolean              @map("is_encrypted")
  /// The memory's version after this change; null for a DELETE.
  resultVersion   Int?                 @map("result_version")
  undoneAt        DateTime?            @map("undone_at") @db.Timestamptz
  createdAt       DateTime             @default(now()) @map("created_at") @db.Timestamptz

  @@index([organizationId, userId, messageId])
  @@map("user_memory_changes")
}

enum UserMemoryOperation {
  ADD
  UPDATE
  DELETE
}
```

- **IDs follow the repository convention:** an `Int` for joins and a UUID
  `publicId` for anything in a URL or an action argument. `organizationId` and
  `userId` are the same strings `Thread` uses, and like `Thread` they have no FK
  to the Better Auth tables (see "A library that owns a table" in AGENTS.md).
- **Provenance is the last writer.** A memory created in thread A and updated in
  thread B points at B. Deleting B deletes it, because its current text derives
  from B. Deleting A leaves it. This is the simplest rule that makes "delete
  this thread" remove what the thread said. The settings page shows which
  thread each memory is tied to. A change row cascades from its own thread, so
  deleting A also removes A's change history.
- **The cascade runs from the FK,** so both thread-deletion paths get it without
  a code change: `thread-core.service.ts` for the panel and `threads.service.ts`
  for the public API. Both hard-delete the thread row.
- **Change rows are kept for 30 days** and then purged by the same job that
  purges expired memories (a daily `memoryPurge` job). Undo is offered only
  while the change row exists.
- **Backfill: none.** No memory exists before this ships, and nothing is
  extracted from past threads. A user's memory starts at the first turn after
  the key is on for their organization. Extracting from history would mean
  running a model over every stored thread without the user having seen the
  feature. That would be a separate, explicit decision.
- **Migration:** additive only. Three tables, two FKs to `threads`, one enum,
  one enum value. Rolling back leaves unused tables and values, all harmless.

## Failure modes

- **The worker is down or Redis is unavailable.** The enqueue fails, the failure
  is logged, and the turn is unaffected. That turn is never extracted, and
  nothing retries it later.
- **The model returns something unparseable.** No-op, logged with the job id,
  never with the content.
- **The model invents a fact about the organization.** Several things stand
  against it, and none is a guarantee:
  - the prompt forbids it;
  - the eval measures how often it happens anyway, and that rate is a rollout
    gate;
  - the user can see and delete the memory;
  - the block tells the answering model that memories are preferences, not
    organizational facts.
- **Prompt injection through a memory.** A user can only inject into their own
  memory, and it only affects their own chats. That is the same reach they
  already have by typing. Memories are still rendered as a quoted list under a
  fixed header, never as instructions, and the output guardrail still runs on
  every answer.
- **Someone else's thread.** The ownership rule stops both extraction and
  reading when the session user is not the owner, or when the thread is on a
  team, shared, or public.
- **Two turns in quick succession, including a user's very first two.** The
  profile is upserted, then locked. An identical `ADD` is skipped, and a
  differently worded duplicate is merged by the next extraction.
- **The user edits a memory while a job is running.** The job's `UPDATE`/`DELETE`
  checks `updatedAt`, so the user's edit wins.
- **A job is still queued when the user forgets everything, opts out, is
  removed, or the org turns the key off.** The apply re-checks all four inside
  the profile lock (epoch, switch, membership, feature) and writes nothing.
- **An old undo after a newer change.** Refused by the `version` check; the
  line says the memory changed since.
- **The model returns an over-long or oversized answer.** The schema drops the
  offending operations (over 300 characters, or past the tenth).
- **Encryption is on and the key cannot be obtained.** Write path: the memory is
  not written, and a warning is logged. Read path: the turn runs without
  memory. The thread path's downgrade logging is unaffected.
- **Encryption is switched on after plaintext memories exist.** Plaintext rows
  keep `isEncrypted = false` and stay readable. New and updated rows are
  encrypted. A test covers the mixed profile.
- **A member is removed from the organization, or leaves.** The member's
  profile is deleted, which cascades to their memories and changes. A0 found
  that no Better Auth hook covers every path — `/organization/leave`, the
  panel's own `removeMember` and apps/admin's removal call none — so the
  recommended mechanism is a trigger on `members` (see A0). Because `members`
  cascades from `organizations` and `users`, the trigger also covers an org or
  user deletion when one is added.
- **The org turns `personalMemory` off.** Extraction and reading stop at the
  next turn (the gate). Stored memories are kept, so turning it back on restores
  them. The user can still delete them, and an org admin can delete all of
  them.
- **The org is over its usage ceiling.** No extraction, logged. Reading costs no
  model call and continues.
- **A guardrail refused the turn.** Not extracted (the gate). A refused input
  must not survive as a memory.

## Phases

Each phase leaves the application working. Everything ships behind
`personalMemory`, which defaults to `false` in `DEFAULT_FEATURES`, and stays off
in the demo organization until Phase E's numbers exist (ADR-50: a slice behind
a disabled key is a `chore`).

The order puts the user's view before any extraction, and extraction before any
reading. At no point does memory exist that its owner cannot see and delete, or
shape an answer before it has been measured.

### Phase A — storage, the key and the boundary, no behaviour

- [x] **A0.** Confirm the Better Auth hook that fires on member removal *and* on
  leave in the installed version. Record the answer in this spec.

  *Answered 2026-10-02, on better-auth 1.7.2: a hook covers one path in four.*
  `organizationHooks.beforeRemoveMember`/`afterRemoveMember` fire only inside
  the plugin's `/organization/remove-member` endpoint
  (`routes/crud-members.mjs`). The other three ways a membership ends call no
  hook:

  | Path | How the row goes | Hook? |
  | --- | --- | --- |
  | Better Auth `/organization/remove-member` | plugin adapter | yes |
  | Better Auth `/organization/leave`, reachable through `/api/auth/[...all]` | plugin adapter (`deleteMember`) | **no** |
  | The panel's `removeMember` action (`organization/profile/actions/members.ts`) | `db.member.delete` | **no** |
  | apps/admin's platform removal (`organizations/actions.ts`) | `tx.member.delete` | **no** |

  So the hook the spec planned would leave memories behind on three paths,
  including the one the panel uses. **Recommendation for A5, awaiting the
  product owner:** a database trigger, `AFTER DELETE ON members`, that deletes
  the matching `user_memory_profiles` row (cascading to memories and
  changes) in the delete's own transaction. It covers all four paths and any
  added later, and — because `members` cascades from `organizations` and
  `users` — also the org and user deletions the spec says do not exist yet.
  It is the same pattern as `user_files_mark_brain_sources_deleted`. It reads
  `members.organization_id`/`user_id` and writes only our table, so it does
  not write a library-owned table; the coupling is to two column names. The
  alternative is three calls (a Better Auth `hooks.after` matcher on
  `/organization/leave`, plus the two Prisma deletes), each one refactor away
  from being forgotten.
- [x] **A1.** The feature key `personalMemory` (default `false`) and its label.
  `features.test.ts` is updated.

  *Done.* In `packages/platform-contracts`, with a label the admin panel shows.
- [x] **A2.** The migration: the three models, `UserMemoryOperation`, and
  `AiUsageStep.MEMORY`. All three models go into `TENANT_SCOPED_MODELS`. The
  migration is checked on a throwaway database first, because the local
  `ragen` database has diverged from `prisma/migrations`.

  *Done.* `20261002120000_personal_memory`, generated with `migrate diff
  --from-migrations` against a shadow database and applied to a fresh one;
  deleting a thread there removed its memory and change rows and kept the
  profile. One addition to the data model below: an index on
  `user_memory_changes.source_thread_id`, which the cascade from `threads`
  scans. `MEMORY` is on the AI-usage page (chart, filter, table) and in the
  api and worker step unions.
- [x] **A3.** `packages/crypto/src/owner-key.ts` with unit tests:
  - the key is created once under a race and reused afterwards;
  - "no key" is returned when encryption is enabled but the provider fails;
  - a mixed profile (plaintext and encrypted rows) reads correctly.

  The architecture test lists the module, and the ADR-42 amendment lands in the
  same PR.

  *Done.* `resolveOwnerKeyForWrite` (`plaintext` / `key` / `unavailable`,
  the last meaning "write nothing"), `sealOwnedContent` and `openOwnedRows`,
  over a `load`/`saveIfAbsent` store. ADR-42 has the amendment, and
  `encryption-lives-in-one-package.test.ts` checks the module stays in the
  package.
- [x] **A4.** `features/memory/services/memory-scope.ts` and the queries and
  commands over it:
  - `getUserMemoriesQuery`;
  - `updateUserMemoryCommand`, `deleteUserMemoryCommand`;
  - `forgetAllUserMemoriesCommand`, which keeps the profile and the switch;
  - `setMemoryExtractionCommand`.

  It also adds the architecture test that memory rows are touched only there,
  and an IDOR test per function: another user's `publicId` in the same org is
  `NotFound`, never a write.

  *Done.* A branded `MemoryOwner` that only `memoryOwnerFromSession()` makes;
  every function scopes by both halves. Two choices the spec left open:
  `updateMemory` writes only under the `version` it read (so an extraction
  in between is not overwritten blind), and a settings edit keeps the
  memory's `sourceThreadId`, so deleting that thread still removes it. The
  guard is `memory-rows-are-read-through-one-module.test.ts`; it allows the
  worker's future `src/activities/memory/`.
- [ ] **A5.** The member-removal cleanup from A0, with its test — the trigger,
  if the recommendation above is accepted. Waits for that decision.

### Phase B — the user's view, still no extraction

- [x] **B1.** The shared usage-limit evaluation, as its own PR: the pure
  computation from `checkUsageLimitsQuery` moves into a package that web and
  worker both import, and each app keeps its own Prisma read. The web ceiling
  tests stay unchanged and green. This PR adds no call site in the worker yet.

  *Done.* `evaluateCeilings`, `usageMonthStart` and `CHAT_TURN_STEP` in
  `packages/platform-contracts/src/usage/ceilings.ts`. apps/api's
  `checkUsageCeilings` was the same arithmetic a second time and uses it too;
  `usage-math-is-not-recopied.test.ts` fails on a ceiling comparison in
  either app.
- [x] **B2.** The `settings/memory` page: list, edit, delete, forget everything,
  the extraction switch, and the deletion-only state when the org has the key
  off. It gets a registry entry in the `you` group, and i18n in all 15 locale
  files, regenerated from a key list rather than hand-merged. With nothing yet
  writing memories, the page shows its empty state.

  *Done.* The repo has 17 locales now, all regenerated. One decision the spec
  left open: **the rail lists the page while the org has `personalMemory` on
  or the user still has memories stored**, and the page is reachable by URL
  either way. Listing it unconditionally would put an unfinished feature in
  every member's menu while the key defaults to off; hiding it whenever the
  key is off would hide the erasure page from someone with memories. The
  settings layout now passes feature flags to the rail at all — it did not
  before, so `featureFlag` on a settings entry had never worked. Edit, delete
  and the switch are refused server-side while the key is off; "forget
  everything" never is.
- [ ] **B3.** The org-admin "delete all members' memories" action through the
  separate `OrgMemoryAdmin` scope, guarded by `canManageOrg()`. Tests: it reads
  no content, a member without the capability is refused, and another org's
  rows are untouched.

### Phase C — extraction

- [ ] **C1.** `memoryExtract` in `packages/jobs` (payload: `orgId`, `userId`,
  `threadId`, `messageId`, and the encrypted masked question). The handler is
  `apps/worker/src/handlers/memory-extract.ts`, registered in the `JobHandlers`
  map, with a Temporal wrapper. It checks the ceiling (B1's evaluation, tested
  at this call site), extracts, applies under the profile lock, writes change
  rows, and records usage. Unit tests cover the Zod parse and the apply:
  - `MEMORY_MAX_ENTRIES`;
  - the `updatedAt` check;
  - the duplicate skip;
  - the placeholder filter;
  - the length and count bounds in the schema;
  - the in-transaction re-check: a job enqueued before "forget everything",
    before opting out, before member removal, and before the key is turned off
    writes nothing in each case.
- [ ] **C2.** The extraction prompt, with a promptfoo suite
  `evals/configs/memory-extraction.yaml`. Its dataset has at least 40 user
  messages, covering:
  - preferences, roles and dated work, which must be kept;
  - organizational facts and third-party facts, which must be dropped;
  - masked placeholders;
  - injection attempts;
  - "yes, like that" cases, which measure what excluding the answer costs.

  The suite reports keep-precision and drop-recall separately.
- [ ] **C3.** The enqueue in `assistant-stream.ts` behind the gate function, with
  a unit test per gate condition, the ownership rule included. From this step,
  with the key on, memories are written and visible in settings, and nothing
  reads them yet. An internal org can now run the eval against real use.
- [ ] **C4.** The daily `memoryPurge` job: expired memories, and change rows
  older than 30 days.

### Phase D — reading

- [ ] **D1.** The memory block in both chains' system templates, passed from
  `assistant-stream.ts` behind the same gate. Chain tests: the block is present
  when memories exist, absent otherwise, absent in a shared or team thread,
  and never inside `{context}`.
- [ ] **D2.** The "Remembered: … · Undo" line under an answer, read from
  `UserMemoryChange`, and the undo command with its `version` check. Tests: an
  undo after a later extraction, and after a settings edit, is refused for each
  of `ADD`, `UPDATE` and `DELETE`.
- [ ] **D3.** E2E `p0-35-personal-memory.spec.ts` (see "Testing").

### Phase E — measure, then turn it on

- [ ] **E1.** Run the extraction eval, and run the existing `rag-quality` suite
  with and without a memory block. Record the numbers in this spec. ADR-20
  applies: memory changes every answer's system prompt.
- [ ] **E2.** Rollout gate: the organizational-fact drop rate is at least 95% on
  the eval, and `rag-quality` shows no regression beyond the suite's noise.
  Then turn `personalMemory` on for the demo organization.
- [ ] **E3.** A line in `docs/changelog-notes.md`, and a `docs/lessons.md` entry
  if any step contradicted this spec.

## Testing

- **Unit:**
  - `owner-key.ts`, including the mixed profile;
  - the gate function, a test per condition, the ownership rule included;
  - the operation apply, the placeholder filter, and the Zod schema of the
    extraction output (valid and invalid);
  - every function in `memory-scope.ts`, including the IDOR cases;
  - forget-everything keeping the switch and incrementing the epoch;
  - the `OrgMemoryAdmin` scope's authorization;
  - the stale-undo refusal;
  - the member-removal hook.
- **Architecture:** `memory-rows-are-read-through-one-module.test.ts`, and the
  updated `encryption-lives-in-one-package.test.ts`.
- **Integration:**
  - two concurrent applies for the same new user, against Postgres: the same
    statement produces one row and one profile;
  - a user's edit made during a job survives;
  - a job paused across "forget everything" writes nothing and does not
    recreate rows;
  - the handler end to end in `npm run worker:test:jobs`, with the model
    stubbed;
  - deleting a thread through `thread-core.service` removes the memories and
    changes it last wrote, and leaves the others.
- **Eval:** `memory-extraction.yaml` (C2), plus the with/without comparison on
  `rag-quality` (E1). No eval runs in CI (see `docs/lessons.md`), so E1's
  numbers are recorded in this file by the person who ran them.
- **E2E, merge-blocking:** `p0-35-personal-memory.spec.ts`, with the route-table
  model stubbed as the other chat p0 tests do:
  1. State a preference, then open a new thread: the answer reflects it.
  2. Delete the memory in settings, then open another thread: the answer no
     longer reflects it.
  3. Delete the source thread: the memory is gone from settings.
  4. A second user in the same org sees none of it, including in a thread the
     first user shared with them.

## Rollout and rollback

- **Order:** A → B → C → D → E, each phase one or more PRs onto `main`, all
  behind `personalMemory = false`. B1 is its own PR because it changes a shared
  path that exists today.
- **First install:** no new required env var. `MEMORY_EXTRACT_MODEL` is
  optional and falls back to `SUMMARY_MODEL`, so `packages/create-ragen-app`
  needs no change. C1's PR description says so explicitly, as the post-task
  workflow requires.
- **Switching off:** set `personalMemory` to `false` for an org, a plan or the
  platform default. Extraction and reading stop at the next turn, with no
  deploy. Users can still delete what is stored.
- **Rollback:** reverting the code is safe at every phase. The migration is
  additive, and the tables can stay. Dropping them is a separate, later
  migration once nobody needs the data. A user's memories are theirs, and
  deleting them is not a side effect of a rollback.
