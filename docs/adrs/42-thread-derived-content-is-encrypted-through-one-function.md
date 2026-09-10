# ADR-42: Content Derived From a Thread Is Encrypted Through One Function

**Status:** Accepted and implemented.
**Date:** 2026-09-10

## Context

Thread messages are encrypted with a per-thread DEK, itself wrapped by a KMS
key (ADR-02, ADR-06). `docs/thread-encryption.md` describes the mechanism, and
`tests/architecture/encryption-lives-in-one-package.test.ts` keeps the
primitives in `packages/crypto` rather than scattered across features.

Gap 5 of the design-system-v2 spec added the first piece of content that is
neither a message nor a document, but derived from both: a **source snippet**,
the verbatim chunk an answer was grounded in, stored per turn so a reopened
thread can still quote it. It sits in `document_retrievals`, beside message
rows that are encrypted.

It will not be the last. Anything that quotes, summarises or extracts from a
thread's content — a per-thread summary, a cached extraction, a citation
fragment in a drawer — has the same shape: derived text, stored separately,
describing content that is protected.

## Decision

**Content derived from a thread is written through the same function, under the
same key, in the same mode as the message it belongs to.**

Concretely, `maybeEncryptContent(threadId, content)` in
`apps/web/src/features/messages/services/thread-content-encryption.ts` is the
only way such content is written. It is a module of its own precisely so there
is one, and reading it back reuses `decryptMessageContents` for the same
reason.

Three consequences follow, and each was a live temptation:

**No per-feature encryption branch.** A feature that re-implements "is
encryption on, does the thread have a DEK, create one if not" has four states
to get right and no reason to stay in step with the message path. The
guarantee is not "the snippet is encrypted" but "the snippet is encrypted *the
same way*", and the only way to hold that is shared code.

**It does not fail closed independently.** When the DEK cannot be obtained,
`apply-dual-content-mode.ts` already stores the *message* unencrypted and logs
the downgrade. Derived content follows it down. Failing closed here would be
stricter than the thing it describes: a misconfigured deployment would keep
writing answers in plaintext while silently dropping snippets — costing a
feature and buying no confidentiality, because the same document text is in the
plaintext answer anyway. The hazard is **divergence**, not weakness, and one
function in one transaction is what rules it out. What should be loud is the
downgrade itself, and that already belongs to the message path.

**Encryption happens before the transaction opens.** The function reads the
thread and can create its key; holding a transaction across that is a lock held
for the length of a KMS round-trip.

## Consequences

Derived content is opaque to SQL — it cannot be searched, aggregated or
inspected in the database when encryption is on. That is the same trade
messages already make and is not new here.

A feature that genuinely needs a different key or a different lifetime has to
change this ADR rather than quietly adding a second path. That is the point.

Read failures degrade rather than propagate: an unreadable snippet drops the
quote and keeps the conversation, because the conversation is what the reader
came for.

## Alternatives considered

**A separate key per derived kind.** More key management, no benefit — the
derived text is a strict subset of what the thread key already protects.

**Storing a reference instead of the text** (a Qdrant chunk id). Rejected on
correctness before privacy: chunk ids do not survive a re-index, so a thread
reopened after re-embedding would have nothing to show. A feature that breaks
because someone re-embedded a document is worse than one that costs storage.

**Leaving derived content in plaintext** because "the answer beside it is
already plaintext when encryption is off". True in that configuration and false
in every other one, and it is the divergence — plaintext snippet next to an
encrypted message — that this ADR exists to prevent.
