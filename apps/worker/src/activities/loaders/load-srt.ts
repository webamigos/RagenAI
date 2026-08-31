import { SRTLLMDocumentLoader } from '../../services/document-loaders/srt-llm-loader';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const loadSrt = async (locator: FileLocator) => {
  try {
    const filePath = await ensureLocalFile(locator);
    const loader = new SRTLLMDocumentLoader({
      filePath,
      fileName: locator.fileName,
      fileId: locator.fileId,
      orgId: locator.orgId,
    });
    return await loader.load();
  } catch (error) {
    logger.error(
      { err: error, fileId: locator.fileId, fileName: locator.fileName },
      'Failed to load SRT',
    );
    throw error;
  }
};
