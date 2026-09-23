import { principalSchema, type Principal } from '@ragenai/brain-contracts';

/**
 * The default `accessibleBy` for a page built from several sources: the
 * narrowest set, never the union (spec D7).
 *
 * The property it guarantees: **anyone matching a principal in the result can
 * read every source.** That is a stronger claim than a set intersection of the
 * strings, and weaker than exact — the exact answer needs team membership,
 * which this function does not have and must not guess at.
 *
 * - `org:<id>` means "everyone in the organization", so a source reachable at
 *   `org:<this org>` constrains nothing and drops out of the intersection. A
 *   page built only from such sources is `org:`-wide.
 * - Among the remaining sources a principal survives only if **every** one of
 *   them lists it verbatim. `user:u` on one source and `team:hr` on another
 *   yield nothing, even when u is in hr: proving it needs a membership lookup,
 *   and the cost of being wrong is a leak while the cost of being strict is a
 *   person pressing "widen". The asymmetry decides it.
 * - A source with **no** principals — the state `backfill-accessible-by.ts`
 *   exists to repair — is readable by nobody below organization scope, so it
 *   empties the result. It is not treated as unrestricted.
 * - An `org:` principal naming another organization matches nobody here and is
 *   treated as such, not as the universal set.
 * - A string that is not a principal at all is dropped. It would match no
 *   reader at retrieval time, so keeping it would only make the result look
 *   wider than it is.
 *
 * An empty result is a legitimate answer and means "nobody yet": the page is
 * then neither exportable nor publishable until a person decides, which is
 * the fail-closed state the spec asks for.
 */
export function intersectPrincipals(
  organizationId: string,
  sources: ReadonlyArray<ReadonlyArray<string>>,
): Principal[] {
  const orgWide = `org:${organizationId}`;
  if (sources.length === 0) {
    return [];
  }

  let narrowing: Set<string> | null = null;
  for (const source of sources) {
    // A principal naming another organization matches nobody here, so it
    // is dropped with the malformed ones: kept, it would make a source
    // readable by nobody look like one readable by someone.
    const valid = source.filter(
      (p) =>
        principalSchema.safeParse(p).success &&
        (!p.startsWith('org:') || p === orgWide),
    );
    if (valid.includes(orgWide)) {
      continue;
    }
    const own = new Set(valid);
    if (narrowing === null) {
      narrowing = own;
    } else {
      const previous: Set<string> = narrowing;
      narrowing = new Set([...own].filter((p) => previous.has(p)));
    }
    if (narrowing.size === 0) {
      return [];
    }
  }

  if (narrowing === null) {
    return [orgWide];
  }
  return [...narrowing].sort();
}

/**
 * Whether `next` is wider than `current` — some principal in `next` that is
 * not in `current`.
 *
 * The review interface asks this to decide between `SET_ACCESS` and
 * `WIDEN_ACCESS` (spec D7): the second is a separate decision with its own
 * confirmation, so a change that adds any reader must be classified as one
 * even when it also removes others. `org:` makes everything below it redundant,
 * so going to `org:` from anything else is a widening, and nothing is wider
 * than `org:`.
 */
export function isWidening(
  organizationId: string,
  current: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): boolean {
  const orgWide = `org:${organizationId}`;
  if (current.includes(orgWide)) {
    return false;
  }
  const before = new Set(current);
  return next.some((p) => !before.has(p));
}
