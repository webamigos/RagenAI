import { MockActivityEnvironment } from '@temporalio/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---- mock services before importing activities ----

jest.mock('../services/db', () => ({
  db: {
    updateEmbeddingStatus: jest.fn().mockResolvedValue(undefined),
    updateParsingStatus: jest.fn().mockResolvedValue(undefined),
    updateFileBinaryInfo: jest.fn().mockResolvedValue(undefined),
    updateFileExtensionAndMime: jest.fn().mockResolvedValue(undefined),
    updateFileType: jest.fn().mockResolvedValue(undefined),
    updateFileSize: jest.fn().mockResolvedValue(undefined),
    bindFileWithDocument: jest.fn().mockResolvedValue(undefined),
    createFileDetailsInDB: jest.fn().mockResolvedValue([{ id: 'file-1' }]),
    getUserFile: jest.fn().mockResolvedValue({ id: 1 }),
    createMarkdownDocument: jest
      .fn()
      .mockResolvedValue([{ id: 1, title: 'test' }]),
    updateThumbnailKey: jest.fn().mockResolvedValue(undefined),
  },
  FileType: {
    UNKNOWN: 0,
    TEXT: 1,
    MARKDOWN: 2,
    EPUB: 3,
    PDF: 4,
    SRT: 5,
    URL: 6,
  },
  UserDocument: {},
  UserFile: {},
}));

jest.mock('../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../services/aws', () => ({
  aws: {
    getFileFromS3: jest.fn().mockResolvedValue({
      filePath: '/tmp/test-file.pdf',
      fileExtension: 'pdf',
    }),
    uploadToS3: jest.fn().mockResolvedValue(undefined),
    downloadToLocalFile: jest.fn().mockResolvedValue(undefined),
  },
}));

// loadText / deleteFileFromTmp delegate filesystem work to the
// ensure-local-file helper. Mock both entry points so the unit tests can
// point them at real fixture files without hitting S3.
jest.mock('../services/ensure-local-file', () => ({
  ensureLocalFile: jest.fn(),
  removeLocalFile: jest.fn(),
  localPathFor: jest.fn(),
}));

jest.mock('../services/meilisearch', () => ({
  meilisearch: {
    addDocuments: jest.fn().mockResolvedValue({ inputTokens: 100 }),
  },
}));

jest.mock('../services/qdrant', () => ({
  qdrantService: {
    addDocuments: jest.fn().mockResolvedValue({ inputTokens: 100 }),
  },
}));

jest.mock('../services/notifications', () => ({
  notification: {
    sendSuccessNotification: jest.fn().mockResolvedValue(undefined),
    sendInfoNotification: jest.fn().mockResolvedValue(undefined),
    sendErrorNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/text-splitters', () => ({
  splitDocuments: jest.fn().mockImplementation((docs) => docs),
  splitMarkdownDocuments: jest.fn().mockImplementation((docs) => docs),
}));

// ---- imports ----

import { prepareMetadata } from '../activities/embeddings';
import { addDocumentsToVectorStore } from '../activities/meilisearch';
import {
  updateEmbeddingStatus,
  updateParsingStatus,
  updateBinaryInfo,
  updateExtensionAndMime,
  updateFileType,
  bindFileWithDocument,
  createFileRecord,
} from '../activities/db';
import {
  sendSuccessNotification,
  sendInfoNotification,
  sendErrorNotification,
} from '../activities/notifications';
import { splitText } from '../activities/splitters';
import { loadText } from '../activities/loaders';
import { deleteFileFromTmp } from '../activities/files';
import {
  ensureLocalFile,
  removeLocalFile,
} from '../services/ensure-local-file';
import { createMarkdownDocument } from '../activities/documents';
import { db } from '../services/db';
import { qdrantService } from '../services/qdrant';
import { notification } from '../services/notifications';

import { EmbeddingStatus, FileType, ParsingStatus } from '../types/UserFile';

// ---- helpers ----

let env: MockActivityEnvironment;

beforeEach(() => {
  env = new MockActivityEnvironment();
  jest.clearAllMocks();
});

// ---- tests ----

describe('db activities', () => {
  it('updateEmbeddingStatus delegates to db service', async () => {
    await env.run(updateEmbeddingStatus, {
      fileId: 'file-1',
      orgId: 'org1',
      status: EmbeddingStatus.COMPLETED,
    });

    expect(db.updateEmbeddingStatus).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org1' },
      data: { embedding_status: EmbeddingStatus.COMPLETED },
    });
  });

  it('updateParsingStatus delegates to db service', async () => {
    await env.run(updateParsingStatus, {
      fileId: 'file-1',
      orgId: 'org1',
      status: ParsingStatus.STARTED,
    });

    expect(db.updateParsingStatus).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org1' },
      data: { parsing_status: ParsingStatus.STARTED },
    });
  });

  it('updateBinaryInfo delegates to db service', async () => {
    await env.run(updateBinaryInfo, {
      fileId: 'file-1',
      orgId: 'org1',
      isBinary: true,
    });

    expect(db.updateFileBinaryInfo).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org1' },
      data: { isBinary: true },
    });
  });

  it('updateExtensionAndMime delegates to db service', async () => {
    await env.run(updateExtensionAndMime, {
      fileId: 'file-1',
      orgId: 'org1',
      ext: 'pdf',
      mime: 'application/pdf',
    });

    expect(db.updateFileExtensionAndMime).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org1' },
      data: { mime: 'application/pdf', ext: 'pdf' },
    });
  });

  it('updateFileType delegates to db service', async () => {
    await env.run(updateFileType, {
      fileId: 'file-1',
      orgId: 'org1',
      type: FileType.PDF,
    });

    expect(db.updateFileType).toHaveBeenCalledWith({
      where: { fileId: 'file-1', orgId: 'org1' },
      data: { type: FileType.PDF },
    });
  });

  it('bindFileWithDocument delegates to db service', async () => {
    await env.run(bindFileWithDocument, {
      fileId: 'file-1',
      documentId: 'doc-1',
      orgId: 'org-1',
    });

    expect(db.bindFileWithDocument).toHaveBeenCalledWith(
      'file-1',
      'doc-1',
      'org-1',
    );
  });

  it('createFileRecord delegates to db service', async () => {
    const result = await env.run(createFileRecord, {
      fileName: 'test.pdf',
      fileSize: 1024,
      fileType: FileType.PDF,
      orgId: 'org1',
      projectId: 'proj-1',
    });

    expect(db.createFileDetailsInDB).toHaveBeenCalledWith({
      file_name: 'test.pdf',
      file_size: 1024,
      file_type: FileType.PDF,
      organization_id: 'org1',
      project_id: 'proj-1',
    });
    expect(result).toEqual([{ id: 'file-1' }]);
  });
});

describe('documents', () => {
  it('createMarkdownDocument delegates to db service', async () => {
    const result = await env.run(createMarkdownDocument, {
      content: '# Hello',
      orgId: 'org1',
      projectId: 'proj-1',
      title: 'doc.md',
      fileId: 'file-1',
    });

    expect(db.createMarkdownDocument).toHaveBeenCalledWith({
      content: '# Hello',
      orgId: 'org1',
      projectId: 'proj-1',
      title: 'doc.md',
      fileId: 'file-1',
    });
    expect(result).toEqual([{ id: 1, title: 'test' }]);
  });
});

describe('notifications', () => {
  it('sendSuccessNotification delegates to notification service', async () => {
    const msg = { content: 'Done', intlKey: 'done' };
    await env.run(sendSuccessNotification, msg);
    expect(notification.sendSuccessNotification).toHaveBeenCalledWith(msg);
  });

  it('sendInfoNotification delegates to notification service', async () => {
    const msg = { content: 'Info', intlKey: 'info' };
    await env.run(sendInfoNotification, msg);
    expect(notification.sendInfoNotification).toHaveBeenCalledWith(msg);
  });

  it('sendErrorNotification delegates to notification service', async () => {
    const msg = { content: 'Error', intlKey: 'error' };
    await env.run(sendErrorNotification, msg);
    expect(notification.sendErrorNotification).toHaveBeenCalledWith(msg);
  });
});

describe('vector store', () => {
  it('addDocumentsToVectorStore calls qdrant service', async () => {
    const docs = [{ pageContent: 'hello', metadata: {} }];
    const result = await env.run(addDocumentsToVectorStore, {
      orgId: 'org1',
      docs,
    });

    expect(qdrantService.addDocuments).toHaveBeenCalledWith({
      orgId: 'org1',
      docs,
    });
    expect(result).toEqual({ inputTokens: 100 });
  });
});

describe('embeddings / prepareMetadata', () => {
  it('generates correct metadata for multiple docs', async () => {
    const docs = [
      { pageContent: 'First chunk content', metadata: {} },
      { pageContent: 'Second chunk content', metadata: {} },
    ];

    const fileRecord = {
      id: 'file-1',
      fileName: 'test.pdf',
      organizationId: 'org1',
      projectId: 'proj-1',
    };

    const result = (await env.run(prepareMetadata, {
      docs,
      fileRecord,
      fileType: FileType.PDF,
      splitterSettings: { chunkSize: 1000, chunkOverlap: 200 },
    })) as Awaited<ReturnType<typeof prepareMetadata>>;

    expect(result).toHaveLength(2);

    // First chunk
    expect(result[0].pageContent).toBe('First chunk content');
    expect(result[0].metadata.file_name).toBe('test.pdf');
    expect(result[0].metadata.file_id).toBe('file-1');
    expect(result[0].metadata.chunk_index).toBe(1);
    expect(result[0].metadata.total_chunks).toBe(2);
    expect(result[0].metadata.previous_chunk_id).toBe(-1);
    expect(result[0].metadata.next_chunk_id).toBe(1);
    expect(result[0].metadata.chunk_size).toBe(1000);
    expect(result[0].metadata.chunk_overlap).toBe(200);
    expect(result[0].metadata.status).toBe('active');
    expect(result[0].embedding).toEqual([]);

    // Second chunk - linked to first
    expect(result[1].metadata.chunk_index).toBe(2);
    expect(result[1].metadata.previous_chunk_id).toBe(0);
    expect(result[1].metadata.next_chunk_id).toBe(-1);
  });

  it('handles a single document correctly', async () => {
    const result = (await env.run(prepareMetadata, {
      docs: [{ pageContent: 'Only chunk', metadata: {} }],
      fileRecord: {
        id: 'file-1',
        fileName: 'single.txt',
        organizationId: 'org1',
        projectId: null,
      },
      fileType: FileType.TEXT,
      splitterSettings: { chunkSize: 800, chunkOverlap: 200 },
    })) as Awaited<ReturnType<typeof prepareMetadata>>;

    expect(result).toHaveLength(1);
    expect(result[0].metadata.previous_chunk_id).toBe(-1);
    expect(result[0].metadata.next_chunk_id).toBe(-1);
    expect(result[0].metadata.total_chunks).toBe(1);
    expect(result[0].metadata.project_id).toBeNull();
  });

  it('counts words correctly', async () => {
    const result = (await env.run(prepareMetadata, {
      docs: [{ pageContent: 'one two three four five', metadata: {} }],
      fileRecord: {
        id: 'file-1',
        fileName: 'w.txt',
        organizationId: 'o1',
        projectId: null,
      },
      fileType: FileType.TEXT,
      splitterSettings: { chunkSize: 800, chunkOverlap: 200 },
    })) as Awaited<ReturnType<typeof prepareMetadata>>;

    expect(result[0].metadata.word_count).toBe(5);
  });
});

describe('splitters', () => {
  const { splitDocuments, splitMarkdownDocuments } = jest.requireMock(
    '../services/text-splitters',
  );

  it('uses markdown splitter for MARKDOWN type', async () => {
    const rawDocs = [{ pageContent: '# Title', metadata: {} }];
    await env.run(splitText, {
      fileType: FileType.MARKDOWN,
      rawDocs,
      splitterSettings: { chunkSize: 800, chunkOverlap: 200 },
    });

    expect(splitMarkdownDocuments).toHaveBeenCalledWith(rawDocs, {
      chunkSize: 800,
      chunkOverlap: 200,
      keepSeparator: true,
    });
    expect(splitDocuments).not.toHaveBeenCalled();
  });

  it('uses default splitter for non-MARKDOWN types', async () => {
    const rawDocs = [{ pageContent: 'Plain text', metadata: {} }];
    await env.run(splitText, {
      fileType: FileType.TEXT,
      rawDocs,
      splitterSettings: { chunkSize: 800, chunkOverlap: 200 },
    });

    expect(splitDocuments).toHaveBeenCalledWith(rawDocs, {
      chunkSize: 800,
      chunkOverlap: 200,
      keepSeparator: true,
    });
    expect(splitMarkdownDocuments).not.toHaveBeenCalled();
  });
});

describe('loaders / loadText', () => {
  const tmpDir = path.join(__dirname, '../../tmp');
  const tmpFile = path.join(tmpDir, 'test-load.txt');

  beforeAll(async () => {
    await fs.promises.mkdir(tmpDir, { recursive: true });
    await fs.promises.writeFile(tmpFile, 'Hello, world!', 'utf-8');
  });

  afterAll(async () => {
    await fs.promises.unlink(tmpFile).catch(() => {});
  });

  it('reads a text file and returns a Document', async () => {
    (ensureLocalFile as jest.Mock).mockResolvedValue(tmpFile);

    const result = (await env.run(loadText, {
      orgId: 'org-1',
      fileId: 'file-1',
      fileName: 'test-load.txt',
    })) as Awaited<ReturnType<typeof loadText>>;
    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe('Hello, world!');
    expect(result[0].metadata.source).toBe(tmpFile);
  });
});

describe('files / deleteFileFromTmp', () => {
  it('delegates to removeLocalFile with the locator', async () => {
    const locator = {
      orgId: 'org-1',
      fileId: 'file-1',
      fileName: 'to-delete.txt',
    };

    await env.run(deleteFileFromTmp, locator);

    expect(removeLocalFile).toHaveBeenCalledWith(locator);
  });

  it('does not throw when removeLocalFile resolves silently', async () => {
    (removeLocalFile as jest.Mock).mockResolvedValueOnce(undefined);

    await expect(
      env.run(deleteFileFromTmp, {
        orgId: 'org-1',
        fileId: 'missing',
        fileName: 'missing.txt',
      }),
    ).resolves.toBeUndefined();
  });
});
