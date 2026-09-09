/**
 * How much a thread is allowed to retrieve.
 *
 * Three levels, decided in
 * `docs/specs/2026-09-09-design-system-v2-functional-gaps.md` (gap 10). The
 * vocabulary lives here rather than in either app because the value crosses the
 * wire between them and is also a Prisma enum — three declarations that have to
 * resolve to the same three strings, which is exactly the drift ADR-33 is about.
 *
 * These are also the `KnowledgeScope` enum's member names and the values stored
 * in `threads.knowledge_scope`. A friendlier spelling was tried first and
 * reverted: Prisma's `@map` on an enum member renames the database value only,
 * so the generated client would still have handed back `'KNOWLEDGE_BASE'` and
 * the wire would have needed a translation step in both directions. This
 * package cannot import the generated client to check — nothing here may
 * (see the module docstring) — so `knowledge-scope-matches-prisma.test.ts` in
 * apps/web asserts the two agree.
 */
export const KNOWLEDGE_SCOPES = [
  /** Every file the asker can reach on `/knowledge/documents-list`. */
  'KNOWLEDGE_BASE',
  /** One assistant — a project — and nothing else. */
  'ASSISTANT',
  /** No retrieval at all. Anything needed is attached to the message. */
  'MODEL_ONLY',
] as const;

export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

/**
 * What an omitted scope means.
 *
 * Today's behaviour, so a client that predates the field keeps working. Note
 * which way this default leans: it is the *widest* of the three, which is only
 * safe because level 1 is itself access-scoped — `accessible_by` decides what
 * "everything you can reach" contains, and it fails closed. The default is
 * about breadth of search, never about permission.
 */
export const DEFAULT_KNOWLEDGE_SCOPE: KnowledgeScope = 'KNOWLEDGE_BASE';

export function isKnowledgeScope(value: unknown): value is KnowledgeScope {
  return (
    typeof value === 'string' &&
    (KNOWLEDGE_SCOPES as readonly string[]).includes(value)
  );
}

/** Whether this scope reaches the vector store at all. */
export function scopeRetrieves(scope: KnowledgeScope): boolean {
  return scope !== 'MODEL_ONLY';
}

/**
 * Whether this scope needs a project to be resolvable.
 *
 * `'ASSISTANT'` with no project is **rejected**, never quietly widened to the
 * knowledge base — a client bug must not turn into a broader search. See the
 * wire table in the spec.
 */
export function scopeRequiresProject(scope: KnowledgeScope): boolean {
  return scope === 'ASSISTANT';
}
