/* eslint-disable no-var */
var mockUpdateWorkflowId: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../../services/db/db.js', () => ({
  db: {
    updateWorkflowId: (...args: unknown[]) => mockUpdateWorkflowId(...args),
  },
}));

jest.mock('../../../services/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { updateWorkflowId } from '../update-workflow-id.js';

describe('updateWorkflowId', () => {
  beforeEach(() => {
    mockUpdateWorkflowId = jest.fn().mockResolvedValue(1);
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
