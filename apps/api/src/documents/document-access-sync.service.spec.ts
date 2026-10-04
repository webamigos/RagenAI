import { DocumentAccessSyncService } from './document-access-sync.service.js';
import { type JobsService } from '../jobs/jobs.service.js';

describe('DocumentAccessSyncService', () => {
  function makeService(start = vi.fn().mockResolvedValue(undefined)) {
    const jobs = { start } as unknown as JobsService;
    return { service: new DocumentAccessSyncService(jobs), start };
  }

  it('starts the syncDocumentAccess job for the organization and what changed', async () => {
    const { service, start } = makeService();

    await service.afterChange('org-1', {
      fileIds: ['file-1'],
      folderIds: ['folder-1'],
    });

    expect(start).toHaveBeenCalledWith(
      'syncDocumentAccess',
      expect.stringMatching(/^access-/),
      { orgId: 'org-1', fileIds: ['file-1'], folderIds: ['folder-1'] },
    );
  });

  it('gives each change its own run id, so two quick changes are two jobs', async () => {
    const { service, start } = makeService();

    await service.afterChange('org-1', { fileIds: ['file-1'] });
    await service.afterChange('org-1', { fileIds: ['file-1'] });

    expect(start.mock.calls[0][1]).not.toBe(start.mock.calls[1][1]);
  });

  it('starts nothing for a change that names nothing', async () => {
    const { service, start } = makeService();

    await service.afterChange('org-1', {});
    await service.afterChange('org-1', { fileIds: [], folderIds: [] });

    expect(start).not.toHaveBeenCalled();
  });

  it('never throws when the queue is unreachable — the change has already happened', async () => {
    const { service } = makeService(
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED redis')),
    );

    await expect(
      service.afterChange('org-1', { fileIds: ['file-1'] }),
    ).resolves.toBeUndefined();
  });
});
