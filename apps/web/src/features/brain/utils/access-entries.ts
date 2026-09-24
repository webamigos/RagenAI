import type { AccessEntry } from '../contracts/brain.types';

/**
 * A page's `accessibleBy`, named for a reader.
 *
 * One entry per principal, in the order they are stored, and nothing
 * rounded: `org:<this org>` is the organization, `user:` and `team:` are the
 * person and the team by name, and anything else — another organization's
 * `org:`, a malformed string — is shown as matching nobody, because at
 * retrieval time that is what it does. An empty list is an empty list; the
 * panel says "nobody yet" rather than inventing a default.
 */
export function accessEntries(
  organizationId: string,
  principals: ReadonlyArray<string>,
  names: {
    users: ReadonlyMap<string, string | null>;
    teams: ReadonlyMap<string, string>;
  },
): AccessEntry[] {
  return principals.map((principal): AccessEntry => {
    const match = /^(org|user|team):([^\s:]+)$/.exec(principal);
    if (!match) {
      return { kind: 'unmatched', principal };
    }
    const [, kind, id] = match as unknown as [string, string, string];
    if (kind === 'org') {
      return id === organizationId
        ? { kind: 'organization' }
        : { kind: 'unmatched', principal };
    }
    if (kind === 'user') {
      return { kind: 'user', id, name: names.users.get(id) ?? null };
    }
    return { kind: 'team', id, name: names.teams.get(id) ?? null };
  });
}

/** The `user:` and `team:` ids a set of principals names, to look them up. */
export function principalIds(principals: ReadonlyArray<string>): {
  userIds: string[];
  teamIds: string[];
} {
  const userIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const p of principals) {
    if (p.startsWith('user:')) {
      userIds.add(p.slice(5));
    } else if (p.startsWith('team:')) {
      teamIds.add(p.slice(5));
    }
  }
  return { userIds: [...userIds], teamIds: [...teamIds] };
}
