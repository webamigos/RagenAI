import * as fs from 'node:fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import {
  DOCUMENT_SEARCH_QUERY_NAME,
  VECTOR_STORE_TABLE_NAME,
} from '@/libs/db/constants/vectorStore';
import { type VectorStoreDocumentMetadata } from '@/app/lib/types/types';
import { createEmbeddingsInstance } from '@/app/lib/services/llm';
import { getOpenaiAPIKey } from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getOrganizationMetadata } from '@/app/actions';
import { MeilisearchVectorStoreClient } from '@/libs/vector-store/meilisearch-client';
import { SupabaseVectorStoreClient } from '@/libs/vector-store/supabase-client';
import { PDFOCRDocumentLoader } from '@/libs/document-loaders/pdf-ocr-loader';
import { SRTLLMDocumentLoader } from '@/libs/document-loaders/srt-llm-loader';
import { SUPPORTED_MIME_TYPES } from '@/app/lib/constants/supportedMimeTypes';
import { getFileExtension } from '@/app/lib/utils/getFileExtension';
import { WebsiteDocumentLoader } from '@/libs/document-loaders/website-loader';
import { WebsiteLoaderMode } from '@/features/documents/contracts/document.types';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import {
  recursiveCharacterSplit,
  markdownSplit,
  splitDocuments,
} from '@/libs/text-splitter';

type ConvertAndStoreResult = {
  success: boolean;
  message: string;
  error?: Error;
};

type ConvertAndStoreDocumentParams = {
  fileContent: string | Buffer;
  fileName: string;
  organizationId: string;
  fileId: string;
  projectId: number;
  projectPublicId?: string;
  mimeType: string;
};

const CHUNK_SETTINGS = {
  markdown: {
    chunkSize: 800,
    chunkOverlap: 200,
  },
  epub: {
    chunkSize: 1500,
    chunkOverlap: 250,
  },
  pdf: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  srt: {
    chunkSize: 1500,
    chunkOverlap: 250,
  },
  url: {
    chunkSize: 2500,
    chunkOverlap: 250,
  },
} as const;

const saveBinaryToTempFile = async (
  content: string | Buffer,
  extension: string,
) => {
  const projectDir = process.cwd();
  const filePath = path.join(projectDir, `temp-${randomUUID()}.${extension}`);

  try {
    const data = content instanceof Buffer ? new Uint8Array(content) : content;
    await fs.promises.writeFile(filePath, data);
    await fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    return {
      success: true,
      filePath,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error saving binary to temp file');
    return {
      success: false,
      message: `Failed to save file at ${filePath}: ${error}`,
    };
  }
};

async function loadEpubDocuments(
  filePath: string,
): Promise<VectorStoreDocument[]> {
  const EPub = (await import('epub2')).default;
  const epub = await EPub.createAsync(filePath);

  const docs: VectorStoreDocument[] = [];
  const chapters = epub.flow || [];

  for (const chapter of chapters) {
    try {
      const content = await epub.getChapterAsync(chapter.id);
      if (content) {
        // Strip HTML tags for plain text content
        const textContent = content
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (textContent) {
          docs.push({
            pageContent: textContent,
            metadata: {
              chapter: chapter.title || chapter.id,
              source: filePath,
            },
          });
        }
      }
    } catch (err) {
      logger.warn(
        { err, chapterId: chapter.id },
        'Could not load epub chapter',
      );
    }
  }

  return docs;
}

async function loadTextDocument(
  filePath: string,
): Promise<VectorStoreDocument[]> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return [
    {
      pageContent: content,
      metadata: { source: filePath },
    },
  ];
}

export const convertAndStoreDocument = async ({
  fileContent,
  fileName,
  organizationId,
  fileId,
  projectId,
  projectPublicId,
  mimeType,
}: ConvertAndStoreDocumentParams): Promise<ConvertAndStoreResult> => {
  try {
    if (!fileContent) {
      return { success: false, message: 'File content missing!' };
    }

    let rawDocs: VectorStoreDocument[] = [];
    const apiKey = await getOpenaiAPIKey(organizationId);

    if (!apiKey) {
      throw new Error('OpenAI API key is required.');
    }

    if (!mimeType) {
      return {
        success: false,
        message: 'Could not detect MIME type of the file.',
      };
    }

    logger.info({ mimeType }, 'Detected MIME type');

    // Resolve project public_id for Meilisearch metadata
    let resolvedProjectPublicId = projectPublicId ?? null;
    if (!resolvedProjectPublicId && projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { public_id: true },
      });
      resolvedProjectPublicId = project?.public_id ?? null;
    }

    const embeddingModel = await createEmbeddingsInstance({ apiKey });

    let fileExtension =
      SUPPORTED_MIME_TYPES[mimeType as keyof typeof SUPPORTED_MIME_TYPES];

    const extension = getFileExtension(fileName);
    if (extension === 'md' || extension === 'txt') {
      fileExtension = 'md';
    }

    if (!fileExtension) {
      return {
        success: false,
        message: `Unsupported file type: ${mimeType}`,
      };
    }
    const { filePath, message, success } = await saveBinaryToTempFile(
      fileContent,
      fileExtension,
    );
    if (!success || !filePath) {
      return {
        success: false,
        message: `Failed to save temporary file: ${message}`,
      };
    }

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      switch (fileExtension) {
        case 'pdf': {
          const loader = new PDFOCRDocumentLoader({
            filePath,
            fileName,
            fileId,
            organizationId,
            projectId: projectId ?? undefined,
          });
          rawDocs = await loader.load();
          break;
        }
        case 'srt': {
          const loader = new SRTLLMDocumentLoader({
            filePath,
            fileName,
            fileId,
            organizationId,
          });
          rawDocs = await loader.load();
          break;
        }
        case 'epub':
          rawDocs = await loadEpubDocuments(filePath);
          break;
        case 'md':
          rawDocs = await loadTextDocument(filePath);
          break;
        case 'url': {
          const urlContent = fileContent.toString();

          // convention to fulfill ConvertAndStoreDocumentParams interface
          const [url, mode] = urlContent.split('-');
          if (
            mode !== WebsiteLoaderMode.CRAWL &&
            mode !== WebsiteLoaderMode.SCRAPE
          ) {
            throw new Error('Invalid crawl mode');
          }
          const loader = new WebsiteDocumentLoader({
            url,
            mode,
            fileName,
            fileId,
            organizationId,
            projectId,
          });
          rawDocs = await loader.load();
          break;
        }
        default:
          throw new Error(
            `Unsupported file type, no loader found. File extension: ${fileExtension}, mimeType: ${mimeType}!`,
          );
      }
    } catch (error) {
      logger.error(
        { err: error },
        `Error loading ${fileExtension.toUpperCase()} file`,
      );
      return {
        success: false,
        message: `File is not accessible at: ${filePath}`,
        error: error as Error,
      };
    } finally {
      await fs.promises
        .rm(filePath, { recursive: true, force: true })
        .catch((error) => {
          logger.error({ err: error }, `Error removing file: ${filePath}`);
        });
    }

    const splitterSettings =
      CHUNK_SETTINGS[fileExtension as keyof typeof CHUNK_SETTINGS] ||
      CHUNK_SETTINGS.epub;

    const splitFn =
      fileExtension === 'md' ? markdownSplit : recursiveCharacterSplit;

    const docs = splitDocuments(rawDocs, splitFn, {
      chunkSize: splitterSettings.chunkSize,
      chunkOverlap: splitterSettings.chunkOverlap,
    });

    const orgId = await getOrgIdFromAuthOrThrow();

    if (!orgId) {
      throw new Error('Invalid organization!');
    }

    const orgMetadata = await getOrganizationMetadata(orgId);
    const vectorStoreType = orgMetadata.vectorStore;

    const updatedDocs = await Promise.all(
      docs.map(async (doc, index) => {
        const text = doc.pageContent;
        const metadata: VectorStoreDocumentMetadata = {
          file_name: fileName,
          page_number: index + 1,
          created_at: new Date().toISOString().split('T')[0],
          id: index,
          organization_id: organizationId,
          file_id: fileId,
          project_public_id: resolvedProjectPublicId,
          source_type: fileExtension,
          chunk_size: splitterSettings.chunkSize,
          chunk_overlap: splitterSettings.chunkOverlap,
          total_chunks: docs.length,
          word_count: text.split(/\s+/).length,
          previous_chunk_id: index > 0 ? index - 1 : -1,
          next_chunk_id: index < docs.length - 1 ? index + 1 : -1,
          status: 'active',
          embedding_model: embeddingModel.model,
        };

        if (vectorStoreType === 'supabase') {
          const embedding = await embeddingModel.embedQuery(text);
          return {
            pageContent: text,
            metadata,
            embedding,
          };
        } else {
          return {
            pageContent: text,
            metadata,
            embedding: [] as number[],
          };
        }
      }),
    );

    if (vectorStoreType === 'supabase') {
      const vectorStore = new SupabaseVectorStoreClient(embeddingModel, {
        client: supabaseVectorStoreClient,
        queryName: DOCUMENT_SEARCH_QUERY_NAME,
        tableName: VECTOR_STORE_TABLE_NAME,
      });

      await vectorStore.addVectors(
        updatedDocs.map((doc) => doc.embedding),
        updatedDocs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        })),
      );
    } else {
      const vectorStore = new MeilisearchVectorStoreClient(embeddingModel, {
        url: process.env.MEILISEARCH_URL!,
        apiKey: process.env.MEILISEARCH_MASTER_KEY,
        indexName: orgId,
      });

      await vectorStore.addDocuments(
        updatedDocs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        })),
      );
    }

    return {
      success: true,
      message: 'Document processed and stored successfully!',
    };
  } catch (error) {
    logger.error({ err: error }, 'Error processing document');
    return {
      success: false,
      message: `Error processing document: ${error}`,
    };
  }
};
