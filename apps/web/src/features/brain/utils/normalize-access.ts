import { principalSchema } from '@ragenai/brain-contracts';

/**
 * A reviewer's new `accessibleBy`, checked and put in one canonical form — or
 * null when any principal would match nobody in this organization.
 *
 * Refused rather than dropped: a page's principals are copied verbatim onto
 * its chunks at publication and matched there as exact strings, so a
 * principal naming another organization, someone who is not a member or a
 * team that does not exist would be shown on the page as access that nothing
 * grants. The reviewer is told instead of the list being quietly shortened.
 *
 * The canonical form is sorted and deduplicated, and `org:<this org>` alone
 * when it is present: everyone in the organization already covers every
 * `user:` and `team:` beside it, and keeping them would make a later
 * narrowing to one of them look like no change at all.
 */
export function normalizeAccess(
  organizationId: string,
  principals: ReadonlyArray<string>,
  known: { memberIds: ReadonlySet<string>; teamIds: ReadonlySet<string> },
): string[] | null {
  const orgWide = `org:${organizationId}`;
  const result = new Set<string>();
  for (const principal of principals) {
    if (!principalSchema.safeParse(principal).success) {
      return null;
    }
    if (!knownHere(principal, orgWide, known)) {
      return null;
    }
    result.add(principal);
  }
  if (result.has(orgWide)) {
    return [orgWide];
  }
  return [...result].sort();
}

function knownHere(
  principal: string,
  orgWide: string,
  known: { memberIds: ReadonlySet<string>; teamIds: ReadonlySet<string> },
): boolean {
  const id = principal.slice(principal.indexOf(':') + 1);
  if (principal.startsWith('org:')) {
    return principal === orgWide;
  }
  if (principal.startsWith('user:')) {
    return known.memberIds.has(id);
  }
  return known.teamIds.has(id);
}

/** Whether two principal lists grant exactly the same, as sets. */
export function sameAccess(
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((p) => right.has(p));
}
