import { describe, it, expect } from 'vitest';

import { fileAccessWhere, type DocumentActor } from '../document-access';

const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
  userId: 'user-1',
  teamIds: [],
  scope: 'member',
  ...over,
});

/** The arms of the OR, as comparable JSON, so order does not matter. */
const arms = (a: DocumentActor) =>
  (fileAccessWhere(a).OR ?? []).map((c) => JSON.stringify(c));

describe('fileAccessWhere', () => {
  it("returns an unrestricted filter for the 'organization' scope", () => {
    // `{}` rather than an OR: that scope sees everything in the org, and the
    // caller still applies organizationId itself.
    expect(fileAccessWhere(actor({ scope: 'organization' }))).toEqual({});
  });

  it("matches nothing for the 'none' scope", () => {
    // Not an empty OR — an empty `OR: []` reads as "no restriction" at a
    // glance and is easy to introduce by accident. The non-member must not
    // reach the `{ isOrgWide: true }` arm the member scope allows.
    expect(fileAccessWhere(actor({ scope: 'none' }))).toEqual({
      id: { in: [] },
    });
    expect(fileAccessWhere(actor({ scope: 'none' })).OR).toBeUndefined();
  });

  it('is unrestricted at that scope even with no user id', () => {
    expect(
      fileAccessWhere(actor({ scope: 'organization', userId: null })),
    ).toEqual({});
  });

  it('always allows files shared with the whole organization', () => {
    expect(arms(actor())).toContain(JSON.stringify({ isOrgWide: true }));
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
    expect(anonymous).toEqual([JSON.stringify({ isOrgWide: true })]);
  });

  it('never emits an undefined grantee id', () => {
    const serialized = JSON.stringify(fileAccessWhere(actor({ userId: null })));
    expect(serialized).not.toContain('undefined');
  });
});
