/* eslint-disable no-var */
var mockUpdateWorkflowId: Mock;
/* eslint-enable no-var */

vi.mock('../../../services/db/db.js', () => ({
  db: {
    updateWorkflowId: (...args: unknown[]) => mockUpdateWorkflowId(...args),
  },
}));

vi.mock('../../../services/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { Mock } from 'vitest';
import { updateWorkflowId } from '../update-workflow-id.js';

describe('updateWorkflowId', () => {
  beforeEach(() => {
    mockUpdateWorkflowId = vi.fn().mockResolvedValue(1);
  });

  it('forwards fileId/orgId as the where clause and workflowId as the update', async () => {
    await updateWorkflowId({
      fileId: 'file-1',
      orgId: 'org-1',
      workflowId: 'web-abc123',
    });

    expect(mockUpdateWorkflowId).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org-1' },
      data: { workflowId: 'web-abc123' },
    });
  });
});
