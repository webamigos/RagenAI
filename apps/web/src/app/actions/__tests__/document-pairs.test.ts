import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn(async () => 'org-from-session'),
}));
const getActiveMember = vi.fn();
vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: (...a: unknown[]) => getActiveMember(...a),
}));
vi.mock('@/features/documents/services/queries/get-document-actor', () => ({
  getDocumentActor: vi.fn(async () => ({
    userId: 'u1',
    teamIds: [],
    scope: 'member',
  })),
}));
const create = vi.fn();
const remove = vi.fn();
const suggest = vi.fn();
vi.mock(
  '@/features/documents/services/commands/create-document-pair-command',
  () => ({ createDocumentPairCommand: (...a: unknown[]) => create(...a) }),
);
vi.mock(
  '@/features/documents/services/commands/remove-document-pair-command',
  () => ({ removeDocumentPairCommand: (...a: unknown[]) => remove(...a) }),
);
vi.mock(
  '@/features/documents/services/queries/suggest-document-pairs-query',
  () => ({ suggestDocumentPairsQuery: (...a: unknown[]) => suggest(...a) }),
);

import {
  createDocumentPairAction,
  removeDocumentPairAction,
  suggestDocumentPairsAction,
} from '../document-pairs';

beforeEach(() => {
  vi.clearAllMocks();
  getActiveMember.mockResolvedValue({ role: 'member' });
});

describe('document pair actions', () => {
  it('take the organization and user from the session, never the arguments', async () => {
    await createDocumentPairAction('a', 'b');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-from-session',
        fileId: 'a',
        counterpartFileId: 'b',
        actor: expect.objectContaining({ userId: 'u1' }),
      }),
    );
  });

  it('pass a manager through and a plain member not', async () => {
    getActiveMember.mockResolvedValue({ role: 'admin' });
    await removeDocumentPairAction('a');
    expect(remove.mock.calls[0][0].canManageOrg).toBe(true);
    getActiveMember.mockResolvedValue({ role: 'member' });
    await suggestDocumentPairsAction('a');
    expect(suggest.mock.calls[0][0].canManageOrg).toBe(false);
  });

  it('treat a caller with no membership as managing nothing', async () => {
    getActiveMember.mockRejectedValue(new Error('no membership'));
    await createDocumentPairAction('a', 'b');
    expect(create.mock.calls[0][0].canManageOrg).toBe(false);
  });
});
