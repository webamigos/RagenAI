import { PDFOCRDocumentLoader } from '../../services/document-loaders/pdf-ocr-loader';
import { processPdfWithClaude } from '../../services/chains/pdf-process-rag/chain';
import { PDF_PROCESSOR } from '../../services/chains/pdf-process-rag/config';
import { type UserFile } from '../../types/UserFile';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

type LoadPdfParams = FileLocator & {
  projectId: UserFile['projectId'];
};

export const loadPdf = async ({
  orgId,
  fileId,
  fileName,
  projectId,
}: LoadPdfParams) => {
  const filePath = await ensureLocalFile({ orgId, fileId, fileName });

  if (PDF_PROCESSOR === 'claude') {
    logger.info({ fileId, fileName }, 'Using Claude native PDF processing');
    const result = await processPdfWithClaude(
      filePath,
      fileName,
      fileId,
      orgId,
      projectId,
    );
    if (!result.success) {
      logger.error(
        { fileId, fileName, message: result.message },
        'Claude PDF processing failed',
      );
      throw new Error(result.message);
    }
    return result.rawDocs;
  }

  // Legacy vision-based PDF processing (PDFium + per-page LLM calls)
  logger.info({ fileId, fileName }, 'Using legacy vision PDF processing');
  const loader = new PDFOCRDocumentLoader({
    filePath,
    fileName,
    fileId,
    orgId,
    projectId,
  });

  try {
    return await loader.load();
  } catch (error) {
    logger.error({ err: error, fileId, fileName }, 'Failed to load PDF');
    throw error;
  }
};
