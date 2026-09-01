import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const checkMimeType = async (locator: FileLocator) => {
  try {
    const filePath = await ensureLocalFile(locator);

    const fileTypeModule = await import('file-type');
    const fileTypeFromBuffer = fileTypeModule.fileTypeFromBuffer;

    const readChunkModule = await import('read-chunk');
    const readChunk = readChunkModule.readChunk;
    const buffer = await readChunk(filePath, { length: 4100 });

    return await fileTypeFromBuffer(buffer);
  } catch {
    logger.error('Error detecting mime type');
    return null;
  }
};
