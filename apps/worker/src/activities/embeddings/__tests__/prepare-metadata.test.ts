import { prepareMetadata } from '../prepare-metadata';
import { FileType } from '../../../types/UserFile';

const baseFileRecord = {
  id: 'file-1',
  fileName: 'doc.md',
  organizationId: 'org-1',
  projectId: null,
};

const splitterSettings = { chunkSize: 1000, chunkOverlap: 100 };

describe('prepareMetadata — language passthrough', () => {
  it('spreads fileRecord.language into every chunk when present', async () => {
    const docs = [
      { pageContent: 'first chunk', metadata: {} },
      { pageContent: 'second chunk', metadata: {} },
    ];

    const result = await prepareMetadata({
      docs,
      fileRecord: { ...baseFileRecord, language: 'eng' },
      fileType: FileType.MARKDOWN,
      splitterSettings,
    });

    expect(result).toHaveLength(2);
    for (const doc of result) {
      expect(doc.metadata.language).toBe('eng');
    }
  });

  it('omits the language key entirely when fileRecord.language is null', async () => {
    const docs = [{ pageContent: 'a chunk', metadata: {} }];

    const result = await prepareMetadata({
      docs,
      fileRecord: { ...baseFileRecord, language: null },
      fileType: FileType.MARKDOWN,
      splitterSettings,
    });

    expect(result[0].metadata.language).toBeUndefined();
    expect('language' in result[0].metadata).toBe(false);
  });

  it('omits the language key when fileRecord.language is not provided at all', async () => {
    const docs = [{ pageContent: 'a chunk', metadata: {} }];

    const result = await prepareMetadata({
      docs,
      fileRecord: baseFileRecord,
      fileType: FileType.MARKDOWN,
      splitterSettings,
    });

    expect('language' in result[0].metadata).toBe(false);
  });
});
