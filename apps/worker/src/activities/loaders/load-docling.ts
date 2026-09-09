import type { Document } from '../../types/Document';
import { convertWithDocling } from '../../services/docling-client';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';
import { type FileType } from '../../types/UserFile';

type LoadDoclingParams = FileLocator & {
  fileType: FileType;
};

/**
 * Parses a document using Docling (docling-serve REST API).
 *
 * Docling converts the file to high-quality Markdown with layout understanding,
 * table extraction, and heading hierarchy. The returned Document uses the
 * Markdown content as pageContent so it can be split by the heading-aware
 * markdown splitter.
 *
 * For spreadsheets (XLSX/CSV), Docling produces Markdown tables rather than
 * raw CSV, which means the output goes through the markdown splitter instead
 * of the CSV row-group splitter. This is intentional — Docling's Markdown
 * tables preserve structure better for RAG retrieval.
 */
export const loadDocling = async ({
  orgId,
  fileId,
  fileName,
  fileType,
}: LoadDoclingParams): Promise<Document[]> => {
  logger.info({ fileId, fileName, fileType }, 'Loading document with Docling');

  const filePath = await ensureLocalFile({ orgId, fileId, fileName });

  const { markdown, pageCount } = await convertWithDocling(filePath, fileName, {
    doOcr: true,
    tableMode: 'accurate',
    imageExportMode: 'placeholder',
  });

  return [
    {
      pageContent: markdown,
      metadata: {
        source: filePath,
        fileType,
        fileName,
        parser: 'docling',
        // The parser's own page count, carried so the workflow can use it
        // instead of guessing from character count. Absent for formats that
        // have no pages; the workflow falls back only then.
        ...(pageCount !== null ? { doclingPageCount: pageCount } : {}),
      },
    },
  ];
};
