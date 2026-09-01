import { readFile } from 'fs/promises';
import mammoth from 'mammoth';
import type { Document } from '../../types/Document';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const loadDocx = async (locator: FileLocator): Promise<Document[]> => {
  logger.info({ fileName: locator.fileName }, 'Loading DOCX file');

  const filePath = await ensureLocalFile(locator);
  const buffer = await readFile(filePath);
  // Use convertToHtml instead of extractRawText so heading styles
  // (Heading 1/2/3) survive as <h1>/<h2>/<h3> tags for the DOCX
  // heading-aware splitter (ADR-17). Mammoth also preserves lists,
  // tables, and inline formatting in the HTML output, which the
  // splitter walker handles or strips as appropriate.
  const result = await mammoth.convertToHtml({ buffer });

  return [
    {
      pageContent: result.value,
      metadata: {
        source: filePath,
        fileType: 'DOCX',
        fileName: locator.fileName,
      },
    },
  ];
};
