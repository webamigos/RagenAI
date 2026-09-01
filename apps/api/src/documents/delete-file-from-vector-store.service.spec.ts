const mockQdrantDelete = jest.fn();
jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    delete: mockQdrantDelete,
  })),
}));

const mockDeleteDocuments = jest.fn();
const mockWaitForTask = jest.fn();
jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue({ deleteDocuments: mockDeleteDocuments }),
    waitForTask: mockWaitForTask,
  })),
}));

const mockSupabaseEq = jest.fn();
const mockSupabaseDelete = jest.fn().mockReturnValue({ eq: mockSupabaseEq });
const mockSupabaseFrom = jest
  .fn()
  .mockReturnValue({ delete: mockSupabaseDelete });
jest.mock('../vector-store/supabase-vector-store-client-factory.js', () => ({
  getSupabaseVectorStoreClient: () => ({ from: mockSupabaseFrom }),
}));

import { DeleteFileFromVectorStoreService } from './delete-file-from-vector-store.service.js';
import { type GetOrganizationMetadataService } from '../organizations/get-organization-metadata.service.js';

describe('DeleteFileFromVectorStoreService', () => {
  function makeService(
    vectorStore: 'qdrant' | 'meilisearch' | 'supabase' | undefined,
  ) {
    const organizationMetadata = {
      get: jest.fn().mockResolvedValue({ vectorStore }),
    } as unknown as GetOrganizationMetadataService;
    return new DeleteFileFromVectorStoreService(organizationMetadata);
  }

  beforeEach(() => {
    mockQdrantDelete.mockReset().mockResolvedValue(undefined);
    mockDeleteDocuments.mockReset().mockResolvedValue({ taskUid: 1 });
    mockWaitForTask.mockReset().mockResolvedValue(undefined);
    mockSupabaseEq.mockReset().mockResolvedValue({ error: null });
  });

  it('deletes by metadata.file_id filter on Qdrant when vectorStore is qdrant', async () => {
    const service = makeService('qdrant');
    await service.delete('file-1', 'org-1');

    expect(mockQdrantDelete).toHaveBeenCalledWith('org-1', {
      filter: {
        must: [{ key: 'metadata.file_id', match: { value: 'file-1' } }],
      },
      wait: true,
    });
  });

  it('defaults to Qdrant when vectorStore is unset (legacy orgs)', async () => {
    const service = makeService(undefined);
    await service.delete('file-1', 'org-1');
    expect(mockQdrantDelete).toHaveBeenCalled();
  });

  it('deletes via Meilisearch filter and waits for the task when vectorStore is meilisearch', async () => {
    const service = makeService('meilisearch');
    await service.delete('file-1', 'org-1');

    expect(mockDeleteDocuments).toHaveBeenCalledWith({
      filter: 'metadata.file_id = file-1',
    });
    expect(mockWaitForTask).toHaveBeenCalledWith(1);
  });

  it('deletes via a Supabase eq filter when vectorStore is supabase', async () => {
    const service = makeService('supabase');
    await service.delete('file-1', 'org-1');

    expect(mockSupabaseFrom).toHaveBeenCalledWith('documents');
    expect(mockSupabaseEq).toHaveBeenCalledWith('metadata->>file_id', 'file-1');
  });

  it('propagates errors from the underlying client', async () => {
    mockQdrantDelete.mockRejectedValue(new Error('qdrant down'));
    const service = makeService('qdrant');

    await expect(service.delete('file-1', 'org-1')).rejects.toThrow(
      'qdrant down',
    );
  });
});
