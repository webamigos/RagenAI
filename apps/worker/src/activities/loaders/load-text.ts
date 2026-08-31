import * as fs from 'node:fs';
import { Document } from '../../types/Document';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const loadText = async (locator: FileLocator): Promise<Document[]> => {
  let filePath: string;
  try {
    filePath = await ensureLocalFile(locator);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return [
      {
        pageContent: content,
        metadata: { source: filePath },
      },
    ];
  } catch (error) {
    logger.error({ err: error, locator }, 'Failed to load text file');
    throw error;
  }
};
