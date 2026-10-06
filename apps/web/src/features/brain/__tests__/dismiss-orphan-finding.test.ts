import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ knowledgeFinding: { updateMany: vi.fn() } }));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
import { dismissOrphanFindingCommand } from '../services/commands/dismiss-orphan-finding-command';
beforeEach(() => vi.resetAllMocks());
it('dismisses only an open orphan in the session organization, preserving its fingerprint', async () => {
  db.knowledgeFinding.updateMany.mockResolvedValue({ count: 1 });
  expect(
    await dismissOrphanFindingCommand({
      orgId: 'org',
      findingPublicId: 'finding',
    }),
  ).toEqual({ success: true, changed: true });
  expect(db.knowledgeFinding.updateMany).toHaveBeenCalledWith({
    where: {
      organizationId: 'org',
      publicId: 'finding',
      type: 'ORPHAN',
      status: 'OPEN',
    },
    data: { status: 'DISMISSED', resolvedAt: expect.any(Date) },
  });
});
it('refuses foreign, closed or non-orphan findings', async () => {
  db.knowledgeFinding.updateMany.mockResolvedValue({ count: 0 });
  expect(
    await dismissOrphanFindingCommand({
      orgId: 'org',
      findingPublicId: 'finding',
    }),
  ).toEqual({ success: false, error: 'not-found' });
});
