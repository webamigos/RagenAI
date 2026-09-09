import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { DocumentActor } from '../document-access';

const findFirstDocument = vi.fn();
const findFirstFile = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userDocument: { findFirst: (...a: unknown[]) => findFirstDocument(...a) },
    userFile: { findFirst: (...a: unknown[]) => findFirstFile(...a) },
  },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({ getCurrentUserId: vi.fn() }));
vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: vi.fn(),
  getUserTeamIds: vi.fn(),
}));

const { canAccessDocument } = await import('../get-document-actor');

const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
  userId: 'user-1',
  teamIds: [],
  scope: 'member',
  ...over,
});

beforeEach(() => {
  findFirstDocument.mockReset();
  findFirstFile.mockReset();
});

const document = (over: { fileId?: string | null; ownerId?: string | null }) =>
  findFirstDocument.mockResolvedValue({
    fileId: null,
    ownerId: null,
    ...over,
  });

/**
 * The regression these cover is a privilege *widening* triggered by an
 * unrelated action.
 *
 * `user_documents.file_id` is ON DELETE SET NULL, and this predicate used to
 * answer `true` for any document with no file — "no ownership signal, so
 * org-wide". Deleting a private file therefore handed that document's
 * decrypted content and its whole version history to every member of the
 * organization. It was observed, not theorised: three of `p0-26`'s assertions
 * flipped from 404 to 200 when an unrelated delete test happened to pick the
 * private fixture.
 */
describe('canAccessDocument', () => {
  it('refuses an actor with no user id, before reading anything', async () => {
    expect(
      await canAccessDocument('doc-1', 'org-1', actor({ userId: null })),
    ).toBe(false);
    expect(findFirstDocument).not.toHaveBeenCalled();
  });

  it('refuses a document that is not in this organization', async () => {
    findFirstDocument.mockResolvedValue(null);
    expect(await canAccessDocument('doc-1', 'org-1', actor())).toBe(false);
  });

  it('defers to the file while the document still has one', async () => {
    document({ fileId: 'file-1', ownerId: 'someone-else' });
    findFirstFile.mockResolvedValue({ id: 'file-1' });

    expect(await canAccessDocument('doc-1', 'org-1', actor())).toBe(true);

    // The file's own grants decide — a folder share or an explicit permission
    // reaches the document too, which is the behaviour that already existed.
    expect(findFirstFile).toHaveBeenCalledOnce();
  });

  it('refuses when the file exists and the actor cannot reach it', async () => {
    document({ fileId: 'file-1', ownerId: 'user-1' });
    findFirstFile.mockResolvedValue(null);

    expect(await canAccessDocument('doc-1', 'org-1', actor())).toBe(false);
  });

  describe('when the file is gone', () => {
    it('does NOT hand the document to every member', async () => {
      // The whole point. Before this fix the answer was `true`.
      document({ fileId: null, ownerId: 'someone-else' });

      expect(await canAccessDocument('doc-1', 'org-1', actor())).toBe(false);
      expect(findFirstFile).not.toHaveBeenCalled();
    });

    it('still lets the owner reach their own document', async () => {
      document({ fileId: null, ownerId: 'user-1' });

      expect(await canAccessDocument('doc-1', 'org-1', actor())).toBe(true);
    });

    it('keeps an unowned document org-wide, as unowned files are', async () => {
      // Documents that predate ownership, and documents authored in the app
      // with no file behind them. Narrowing these would hide content people
      // rely on, and they carry no ownership signal to narrow *to*.
      document({ fileId: null, ownerId: null });

      expect(await canAccessDocument('doc-1', 'org-1', actor())).toBe(true);
    });

    it('lets the organization scope see it regardless of owner', async () => {
      document({ fileId: null, ownerId: 'someone-else' });

      expect(
        await canAccessDocument(
          'doc-1',
          'org-1',
          actor({ scope: 'organization' }),
        ),
      ).toBe(true);
    });

    it('refuses the none scope even for an unowned document', async () => {
      // Mirrors `fileAccessWhere`: a non-member is not "within the org", so
      // the org-wide allowance for unowned content does not reach them.
      document({ fileId: null, ownerId: null });

      expect(
        await canAccessDocument('doc-1', 'org-1', actor({ scope: 'none' })),
      ).toBe(false);
    });
  });

  it('scopes the document lookup by organization', async () => {
    document({ fileId: null, ownerId: null });
    await canAccessDocument('doc-1', 'org-1', actor());

    expect(findFirstDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', organizationId: 'org-1' },
      }),
    );
  });

  it('reads ownerId, so the fallback has something to decide on', async () => {
    // Guards the select. Dropping `ownerId` from it would make every fileless
    // document unowned, quietly restoring the org-wide answer for all of them.
    document({ fileId: null, ownerId: null });
    await canAccessDocument('doc-1', 'org-1', actor());

    expect(findFirstDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { fileId: true, ownerId: true },
      }),
    );
  });
});
