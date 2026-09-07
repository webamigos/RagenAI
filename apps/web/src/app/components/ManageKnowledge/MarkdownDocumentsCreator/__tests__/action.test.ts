import { beforeEach, describe, expect, it, vi } from 'vitest';

const ragenApiRequest = vi.fn().mockResolvedValue([]);
const getOrgIdFromAuthOrThrow = vi.fn().mockResolvedValue('org-from-session');
const getCurrentUserId = vi.fn().mockResolvedValue('user-1');
const assertCanManageDocuments = vi.fn();

vi.mock('@/libs/ragen-api-client/client', () => ({ ragenApiRequest }));
// The logger picks its implementation with a bare `require` when `window`
// exists, which jsdom provides — so it has to be mocked here as it is
// everywhere else in this suite.
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
}));
// The write-restriction gate resolves flags from the database. These tests
// cover what happens once it allows the write; its refusal is asserted below.
vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageDocuments: (...args: unknown[]) =>
    assertCanManageDocuments(...args),
  assertCanManageProjects: vi.fn(),
  assertCanManageOrganizationSettings: vi.fn(),
}));

const { saveMarkdownWithMeta, fetchDocumentByOrganization, updateDocument } =
  await import('../action');

/**
 * These actions used to accept an organization id and forward it as the
 * authenticated tenant. `issueSessionToken()` signs whatever it is handed and
 * `apps/api` verifies only the signature, so a caller could name any
 * organization and read or write in it — and because this module is
 * `'use server'` and sits in the client graph, every export was reachable,
 * including the one no code calls.
 *
 * The fix is that the organization comes from the session. What these tests
 * pin down is the `orgId` handed to `ragenApiRequest`, because that value is
 * what ends up inside the signed token — asserting anything shallower would
 * pass just as happily with the parameter back.
 */
describe('the markdown document actions take their organization from the session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrgIdFromAuthOrThrow.mockResolvedValue('org-from-session');
    getCurrentUserId.mockResolvedValue('user-1');
    assertCanManageDocuments.mockResolvedValue(undefined);
    ragenApiRequest.mockResolvedValue([]);
  });

  it('creates a document in the session organization', async () => {
    await saveMarkdownWithMeta({
      title: 'Notes',
      content: '<p>hello</p>',
    } as never);

    expect(ragenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-from-session' }),
    );
  });

  it('reads a document from the session organization', async () => {
    await fetchDocumentByOrganization('doc-1');

    expect(ragenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-from-session' }),
    );
  });

  it('updates a document in the session organization', async () => {
    await updateDocument({ documentId: 'doc-1', title: 'Renamed' });

    expect(ragenApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-from-session' }),
    );
  });

  it('refuses rather than guessing when the session has no organization', async () => {
    // `getOrgIdFromAuthOrThrow` throws for an unauthenticated or org-less
    // session. The action must let that surface, not fall back to a default.
    getOrgIdFromAuthOrThrow.mockRejectedValue(new Error('No organization'));

    await expect(
      saveMarkdownWithMeta({ title: 'x', content: 'y' } as never),
    ).rejects.toThrow('No organization');
    expect(ragenApiRequest).not.toHaveBeenCalled();
  });

  it('asks the write-restriction gate with the session organization', async () => {
    await saveMarkdownWithMeta({
      title: 'Doc',
      content: '<p>Body</p>',
    } as Parameters<typeof saveMarkdownWithMeta>[0]);

    expect(assertCanManageDocuments).toHaveBeenCalledWith('org-from-session');
  });

  it('writes nothing when the organization cannot manage documents', async () => {
    // Authoring markdown is a corpus change reached through neither upload nor
    // delete, so a frozen organization could still write here. A refusal has
    // to stop the request, not merely precede it.
    assertCanManageDocuments.mockRejectedValue(
      new Error('This organization cannot add or remove documents'),
    );

    await expect(
      saveMarkdownWithMeta({
        title: 'Doc',
        content: '<p>Body</p>',
      } as Parameters<typeof saveMarkdownWithMeta>[0]),
    ).rejects.toThrow(/cannot add or remove documents/);

    expect(ragenApiRequest).not.toHaveBeenCalled();
  });

  it('leaves a read path alone', async () => {
    // fetchDocumentByOrganization is a GET. Gating a read would break the
    // demo's whole point, which is that a prospect can look at the corpus.
    await fetchDocumentByOrganization('doc-1');

    expect(assertCanManageDocuments).not.toHaveBeenCalled();
  });
});
