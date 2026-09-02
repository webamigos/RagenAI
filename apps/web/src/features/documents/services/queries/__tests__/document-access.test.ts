import { describe, it, expect } from 'vitest';

import { fileAccessWhere, type DocumentActor } from '../document-access';

const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
  userId: 'user-1',
  teamIds: [],
  isOrgAdmin: false,
  ...over,
});

/** The arms of the OR, as comparable JSON, so order does not matter. */
const arms = (a: DocumentActor) =>
  (fileAccessWhere(a).OR ?? []).map((c) => JSON.stringify(c));

describe('fileAccessWhere', () => {
  it('returns an unrestricted filter for an org admin', () => {
    // `{}` rather than an OR: an admin sees everything in the org, and the
    // caller still applies organizationId itself.
    expect(fileAccessWhere(actor({ isOrgAdmin: true }))).toEqual({});
  });

  it('is unrestricted for an admin even with no user id', () => {
    expect(fileAccessWhere(actor({ isOrgAdmin: true, userId: null }))).toEqual(
      {},
    );
  });

  it('always allows unowned files, which predate ownership', () => {
    expect(arms(actor())).toContain(JSON.stringify({ ownerId: null }));
  });

  it("allows the actor's own files", () => {
    expect(arms(actor())).toContain(JSON.stringify({ ownerId: 'user-1' }));
  });

  it('allows a file granted to the actor directly', () => {
    expect(arms(actor())).toContain(
      JSON.stringify({
        permissions: { some: { granteeType: 'user', granteeId: 'user-1' } },
      }),
    );
  });

  it('allows a file whose folder was granted to the actor', () => {
    // The arm that was missing: a folder share used to grant nothing in the
    // default listing, only under "shared with me".
    expect(arms(actor())).toContain(
      JSON.stringify({
        folder: {
          permissions: { some: { granteeType: 'user', granteeId: 'user-1' } },
        },
      }),
    );
  });

  it('adds team arms only when the actor is on a team', () => {
    const withoutTeams = arms(actor());
    expect(withoutTeams.some((a) => a.includes('granteeType":"team'))).toBe(
      false,
    );
    expect(withoutTeams.some((a) => a.includes('teamId'))).toBe(false);

    const withTeams = arms(actor({ teamIds: ['team-a', 'team-b'] }));
    expect(withTeams).toContain(
      JSON.stringify({ folder: { teamId: { in: ['team-a', 'team-b'] } } }),
    );
    expect(withTeams).toContain(
      JSON.stringify({
        permissions: {
          some: {
            granteeType: 'team',
            granteeId: { in: ['team-a', 'team-b'] },
          },
        },
      }),
    );
    expect(withTeams).toContain(
      JSON.stringify({
        folder: {
          permissions: {
            some: {
              granteeType: 'team',
              granteeId: { in: ['team-a', 'team-b'] },
            },
          },
        },
      }),
    );
  });

  it('emits no user arms without a user id, leaving only unowned files', () => {
    // A sessionless caller must not match on `granteeId: undefined`, which
    // Prisma would treat as "no condition" and quietly widen the filter.
    const anonymous = arms(actor({ userId: null }));
    expect(anonymous).toEqual([JSON.stringify({ ownerId: null })]);
  });

  it('never emits an undefined grantee id', () => {
    const serialized = JSON.stringify(fileAccessWhere(actor({ userId: null })));
    expect(serialized).not.toContain('undefined');
  });
});
