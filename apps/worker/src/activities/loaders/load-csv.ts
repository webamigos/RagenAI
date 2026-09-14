import { readFile } from 'fs/promises';
import type { Document } from '../../types/Document.js';
import { FileType } from '../../types/UserFile.js';
import { logger } from '../../services/logger.js';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file.js';

export const loadCsv = async (locator: FileLocator): Promise<Document[]> => {
  logger.info({ fileName: locator.fileName }, 'Loading CSV file');

  const filePath = await ensureLocalFile(locator);
  const content = await readFile(filePath, 'utf-8');

  return [
    {
      pageContent: content,
      metadata: {
        source: filePath,
        fileType: FileType.CSV,
        fileName: locator.fileName,
      },
    },
  ];
};
