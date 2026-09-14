import sharp from 'sharp';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import type { Document } from '../../types/Document.js';
import { describeImageWithLLM } from '../../services/chains/pdf-process-rag/operations.js';
import { getChatModelForOrg } from '../../services/llm/index.js';
import { availableModels } from '../../services/chains/pdf-process-rag/config.js';
import { FileType } from '../../types/UserFile.js';
import { logger } from '../../services/logger.js';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file.js';

export const loadImage = async (locator: FileLocator): Promise<Document[]> => {
  const { orgId, fileId, fileName } = locator;
  logger.info({ fileId, fileName }, 'Loading image for vision description');

  const filePath = await ensureLocalFile(locator);

  // Normalize to PNG for consistent vision LLM input
  const pngBuffer = await sharp(filePath).png().toBuffer();
  const normalizedPath = path.join(
    path.dirname(filePath),
    `${fileId}_normalized.png`,
  );
  await writeFile(normalizedPath, pngBuffer);

  try {
    const model = await getChatModelForOrg(orgId, availableModels.mini);
    const description = await describeImageWithLLM(
      normalizedPath,
      model,
      orgId,
    );

    return [
      {
        pageContent: `[Image: ${fileName}]\n\n${description}`,
        metadata: { source: filePath, fileType: FileType.IMAGE, fileName },
      },
    ];
  } finally {
    await unlink(normalizedPath).catch((err) =>
      logger.warn({ err, normalizedPath }, 'Failed to clean up normalized PNG'),
    );
  }
};
