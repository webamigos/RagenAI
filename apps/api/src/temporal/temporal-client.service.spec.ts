const mockWorkflowStart = jest.fn();
const mockLazyConnection = { type: 'lazy-connection' };

jest.mock('@temporalio/client', () => ({
  Connection: { lazy: jest.fn().mockReturnValue(mockLazyConnection) },
  Client: jest.fn().mockImplementation(() => ({
    workflow: { start: mockWorkflowStart },
  })),
}));

import { Connection, Client } from '@temporalio/client';
import { TemporalClientService } from './temporal-client.service.js';
import { Workflow } from './temporal.consts.js';

const ConnectionMock = Connection as unknown as { lazy: jest.Mock };
const ClientMock = Client as unknown as jest.Mock;

describe('TemporalClientService', () => {
  let service: TemporalClientService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockWorkflowStart.mockReset().mockResolvedValue(undefined);
    ConnectionMock.lazy.mockClear();
    ClientMock.mockClear();
    service = new TemporalClientService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('connects to TEMPORAL_SERVER_ADDRESS and starts the workflow on the shared task queue', async () => {
    process.env.TEMPORAL_SERVER_ADDRESS = 'temporal.internal:7233';

    await service.startWorkflow(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', [
      { fileId: 'file-1' },
    ]);

    expect(ConnectionMock.lazy).toHaveBeenCalledWith({
      address: 'temporal.internal:7233',
    });
    expect(mockWorkflowStart).toHaveBeenCalledWith('runFileEmbeddings', {
      taskQueue: 'ragen-tasks',
      workflowId: 'doc-abc',
      args: [{ fileId: 'file-1' }],
    });
  });

  it('falls back to localhost:7233 when TEMPORAL_SERVER_ADDRESS is unset', async () => {
    delete process.env.TEMPORAL_SERVER_ADDRESS;

    await service.startWorkflow(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', []);

    expect(ConnectionMock.lazy).toHaveBeenCalledWith({
      address: 'localhost:7233',
    });
  });

  it('propagates errors from workflow.start', async () => {
    mockWorkflowStart.mockRejectedValue(new Error('temporal down'));

    await expect(
      service.startWorkflow(Workflow.RUN_FILE_EMBEDDINGS, 'doc-abc', []),
    ).rejects.toThrow('temporal down');
  });
});
