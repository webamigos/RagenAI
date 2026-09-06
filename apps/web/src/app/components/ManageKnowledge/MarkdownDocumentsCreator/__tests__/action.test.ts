import { beforeEach, describe, expect, it, vi } from 'vitest';

const ragenApiRequest = vi.fn().mockResolvedValue([]);
const getOrgIdFromAuthOrThrow = vi.fn().mockResolvedValue('org-from-session');
const getCurrentUserId = vi.fn().mockResolvedValue('user-1');

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
});
