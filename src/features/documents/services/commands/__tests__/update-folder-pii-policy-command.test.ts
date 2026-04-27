import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateFolderPiiPolicyCommand } from '../update-folder-pii-policy-command';

const mockUpdate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentFolder: { update: (...args: unknown[]) => mockUpdate(...args) },
  },
}));

describe('updateFolderPiiPolicyCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates piiPolicy on the correct folder', async () => {
    mockUpdate.mockResolvedValue({ id: 'f1', piiPolicy: 'STRICT' });
    await updateFolderPiiPolicyCommand('f1', 'org1', 'STRICT');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'f1', organizationId: 'org1' },
      data: { piiPolicy: 'STRICT' },
    });
  });

  it('rejects invalid policy values', async () => {
    await expect(
      updateFolderPiiPolicyCommand('f1', 'org1', 'invalid' as any),
    ).rejects.toThrow();
  });
});
